// PDF.js worker 설정
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// jsPDF 참조
const { jsPDF } = window.jspdf;

// ==================== 전역 변수 ====================
// Image Converter
let pdfDocument = null;
let convertedImages = [];
let pdfFileName = '';

// PDF Compressor
let compressPdfDocument = null;
let compressPdfFileName = '';
let compressPdfOriginalSize = 0;
let compressedPdfBlob = null;

// Image Compressor
let imgCompressFiles = []; // [{file, name}]
let imgCompressResults = []; // [{name, blob, originalSize, compressedSize}]

// PDF Merger
let mergeFiles = []; // [{file, name, pageCount}]
let mergedPdfBlob = null;

// PDF Splitter
let splitPdfFile = null;
let splitPdfDocument = null;
let splitPdfFileName = '';
let splitResultBlobs = [];

// Page Editor
let pageEditorFile = null;
let pageEditorDocument = null;
let pageEditorFileName = '';
let pageEditorPages = []; // [{originalIndex, dataUrl}]
let pageEditorResultBlob = null;
let dragSrcIdx = null;

// Metadata
let metadataPdfDocument = null;

// Watermark
let watermarkPdfFile = null;
let watermarkPdfFileName = '';
let watermarkedPdfBlob = null;

// ==================== DOM 요소 - 공통 ====================
const hamburgerBtn = document.getElementById('hamburgerBtn');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const navItems = document.querySelectorAll('.nav-item');
const converterTool = document.getElementById('converterTool');
const imageCompressorTool = document.getElementById('imageCompressorTool');
const compressorTool = document.getElementById('compressorTool');
const mergerTool = document.getElementById('mergerTool');
const splitterTool = document.getElementById('splitterTool');
const pageEditorTool = document.getElementById('pageEditorTool');
const metadataTool = document.getElementById('metadataTool');
const watermarkTool = document.getElementById('watermarkTool');

// ==================== DOM 요소 - 이미지 변환 ====================
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const selectFileBtn = document.getElementById('selectFileBtn');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const pageCount = document.getElementById('pageCount');
const removeFileBtn = document.getElementById('removeFileBtn');
const settingsPanel = document.getElementById('settingsPanel');
const qualitySlider = document.getElementById('qualitySlider');
const qualityValue = document.getElementById('qualityValue');
const qualityGroup = document.getElementById('qualityGroup');
const scaleSlider = document.getElementById('scaleSlider');
const scaleValue = document.getElementById('scaleValue');
const customRangeInput = document.getElementById('customRangeInput');
const pageRangeInput = document.getElementById('pageRangeInput');
const convertBtn = document.getElementById('convertBtn');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const previewArea = document.getElementById('previewArea');
const firstPagePreview = document.getElementById('firstPagePreview');
const lastPagePreview = document.getElementById('lastPagePreview');
const downloadSection = document.getElementById('downloadSection');
const downloadZipBtn = document.getElementById('downloadZipBtn');
const downloadIndividualBtn = document.getElementById('downloadIndividualBtn');
const individualLinks = document.getElementById('individualLinks');
const linksList = document.getElementById('linksList');

// ==================== DOM 요소 - 이미지 압축 ====================
const imgCompressDropZone = document.getElementById('imgCompressDropZone');
const imgCompressFileInput = document.getElementById('imgCompressFileInput');
const imgCompressSelectBtn = document.getElementById('imgCompressSelectBtn');
const imgCompressFileListSection = document.getElementById('imgCompressFileListSection');
const imgCompressFileCount = document.getElementById('imgCompressFileCount');
const imgCompressAddMoreBtn = document.getElementById('imgCompressAddMoreBtn');
const imgCompressAddMoreInput = document.getElementById('imgCompressAddMoreInput');
const imgCompressFileList = document.getElementById('imgCompressFileList');
const imgCompressSettingsPanel = document.getElementById('imgCompressSettingsPanel');
const imgCompressBtn = document.getElementById('imgCompressBtn');
const imgCompressProgressContainer = document.getElementById('imgCompressProgressContainer');
const imgCompressProgressFill = document.getElementById('imgCompressProgressFill');
const imgCompressProgressText = document.getElementById('imgCompressProgressText');
const imgCompressResultSection = document.getElementById('imgCompressResultSection');
const imgCompressOriginalTotal = document.getElementById('imgCompressOriginalTotal');
const imgCompressCompressedTotal = document.getElementById('imgCompressCompressedTotal');
const imgCompressSavings = document.getElementById('imgCompressSavings');
const imgCompressDownloadZipBtn = document.getElementById('imgCompressDownloadZipBtn');
const imgCompressResultList = document.getElementById('imgCompressResultList');

// ==================== DOM 요소 - PDF 압축 ====================
const compressDropZone = document.getElementById('compressDropZone');
const compressFileInput = document.getElementById('compressFileInput');
const compressSelectFileBtn = document.getElementById('compressSelectFileBtn');
const compressFileInfo = document.getElementById('compressFileInfo');
const compressFileName = document.getElementById('compressFileName');
const compressFileSize = document.getElementById('compressFileSize');
const compressPageCount = document.getElementById('compressPageCount');
const compressRemoveFileBtn = document.getElementById('compressRemoveFileBtn');
const compressSettingsPanel = document.getElementById('compressSettingsPanel');
const compressScaleSlider = document.getElementById('compressScaleSlider');
const compressScaleValue = document.getElementById('compressScaleValue');
const compressBtn = document.getElementById('compressBtn');
const compressProgressContainer = document.getElementById('compressProgressContainer');
const compressProgressFill = document.getElementById('compressProgressFill');
const compressProgressText = document.getElementById('compressProgressText');
const compressResultSection = document.getElementById('compressResultSection');
const originalSizeEl = document.getElementById('originalSize');
const compressedSizeEl = document.getElementById('compressedSize');
const savingsPercentEl = document.getElementById('savingsPercent');
const downloadCompressedBtn = document.getElementById('downloadCompressedBtn');

// ==================== DOM 요소 - PDF 병합 ====================
const mergeDropZone = document.getElementById('mergeDropZone');
const mergeFileInput = document.getElementById('mergeFileInput');
const mergeSelectFilesBtn = document.getElementById('mergeSelectFilesBtn');
const mergeFileListSection = document.getElementById('mergeFileListSection');
const mergeFileCount = document.getElementById('mergeFileCount');
const mergeAddMoreBtn = document.getElementById('mergeAddMoreBtn');
const mergeAddMoreInput = document.getElementById('mergeAddMoreInput');
const mergeFileList = document.getElementById('mergeFileList');
const mergeBtn = document.getElementById('mergeBtn');
const mergeProgressContainer = document.getElementById('mergeProgressContainer');
const mergeProgressFill = document.getElementById('mergeProgressFill');
const mergeProgressText = document.getElementById('mergeProgressText');
const mergeResultSection = document.getElementById('mergeResultSection');
const mergeTotalPages = document.getElementById('mergeTotalPages');
const mergeTotalSize = document.getElementById('mergeTotalSize');
const downloadMergedBtn = document.getElementById('downloadMergedBtn');

// ==================== DOM 요소 - PDF 분할 ====================
const splitDropZone = document.getElementById('splitDropZone');
const splitFileInput = document.getElementById('splitFileInput');
const splitSelectFileBtn = document.getElementById('splitSelectFileBtn');
const splitFileInfo = document.getElementById('splitFileInfo');
const splitFileName = document.getElementById('splitFileName');
const splitPageCount = document.getElementById('splitPageCount');
const splitRemoveFileBtn = document.getElementById('splitRemoveFileBtn');
const splitSettingsPanel = document.getElementById('splitSettingsPanel');
const splitRangesGroup = document.getElementById('splitRangesGroup');
const splitRangesText = document.getElementById('splitRangesText');
const splitBtn = document.getElementById('splitBtn');
const splitProgressContainer = document.getElementById('splitProgressContainer');
const splitProgressFill = document.getElementById('splitProgressFill');
const splitProgressText = document.getElementById('splitProgressText');
const splitResultSection = document.getElementById('splitResultSection');
const splitResultInfo = document.getElementById('splitResultInfo');
const downloadSplitZipBtn = document.getElementById('downloadSplitZipBtn');
const splitLinksList = document.getElementById('splitLinksList');

// ==================== DOM 요소 - 페이지 편집 ====================
const pageEditorDropZone = document.getElementById('pageEditorDropZone');
const pageEditorFileInput = document.getElementById('pageEditorFileInput');
const pageEditorSelectFileBtn = document.getElementById('pageEditorSelectFileBtn');
const pageEditorFileInfo = document.getElementById('pageEditorFileInfo');
const pageEditorFileNameEl = document.getElementById('pageEditorFileName');
const pageEditorPageCountEl = document.getElementById('pageEditorPageCount');
const pageEditorRemoveFileBtn = document.getElementById('pageEditorRemoveFileBtn');
const pageEditorLoading = document.getElementById('pageEditorLoading');
const pageEditorPanel = document.getElementById('pageEditorPanel');
const pageGrid = document.getElementById('pageGrid');
const pageEditorCount = document.getElementById('pageEditorCount');
const savePageEditorBtn = document.getElementById('savePageEditorBtn');
const pageEditorResultSection = document.getElementById('pageEditorResultSection');
const downloadPageEditorBtn = document.getElementById('downloadPageEditorBtn');

// ==================== DOM 요소 - 메타데이터 ====================
const metaDropZone = document.getElementById('metaDropZone');
const metaFileInput = document.getElementById('metaFileInput');
const metaSelectFileBtn = document.getElementById('metaSelectFileBtn');
const metaFileInfo = document.getElementById('metaFileInfo');
const metaFileNameEl = document.getElementById('metaFileName');
const metaRemoveFileBtn = document.getElementById('metaRemoveFileBtn');
const metadataPanel = document.getElementById('metadataPanel');
const metadataTableBody = document.getElementById('metadataTableBody');

// ==================== DOM 요소 - 워터마크 ====================
const watermarkDropZone = document.getElementById('watermarkDropZone');
const watermarkFileInput = document.getElementById('watermarkFileInput');
const watermarkSelectFileBtn = document.getElementById('watermarkSelectFileBtn');
const watermarkFileInfo = document.getElementById('watermarkFileInfo');
const watermarkFileNameEl = document.getElementById('watermarkFileName');
const watermarkPageCountEl = document.getElementById('watermarkPageCount');
const watermarkRemoveFileBtn = document.getElementById('watermarkRemoveFileBtn');
const watermarkSettingsPanel = document.getElementById('watermarkSettingsPanel');
const textWatermarkOptions = document.getElementById('textWatermarkOptions');
const imageWatermarkOptions = document.getElementById('imageWatermarkOptions');
const watermarkText = document.getElementById('watermarkText');
const watermarkFontSize = document.getElementById('watermarkFontSize');
const watermarkFontSizeValue = document.getElementById('watermarkFontSizeValue');
const watermarkOpacity = document.getElementById('watermarkOpacity');
const watermarkOpacityValue = document.getElementById('watermarkOpacityValue');
const watermarkAngle = document.getElementById('watermarkAngle');
const watermarkAngleValue = document.getElementById('watermarkAngleValue');
const watermarkImgOpacity = document.getElementById('watermarkImgOpacity');
const watermarkImgOpacityValue = document.getElementById('watermarkImgOpacityValue');
const watermarkImgSize = document.getElementById('watermarkImgSize');
const watermarkImgSizeValue = document.getElementById('watermarkImgSizeValue');
const applyWatermarkBtn = document.getElementById('applyWatermarkBtn');
const watermarkProgressContainer = document.getElementById('watermarkProgressContainer');
const watermarkProgressFill = document.getElementById('watermarkProgressFill');
const watermarkProgressTextEl = document.getElementById('watermarkProgressText');
const watermarkResultSection = document.getElementById('watermarkResultSection');
const downloadWatermarkedBtn = document.getElementById('downloadWatermarkedBtn');

// ==================== 유틸리티 함수 ====================
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatPdfDate(dateStr) {
    if (!dateStr) return '-';
    try {
        const cleaned = dateStr.replace(/^D:/, '');
        const year  = cleaned.substring(0, 4);
        const month = cleaned.substring(4, 6);
        const day   = cleaned.substring(6, 8);
        const hour  = cleaned.substring(8, 10)  || '00';
        const min   = cleaned.substring(10, 12) || '00';
        if (!year || year === '    ') return '-';
        return `${year}-${month}-${day} ${hour}:${min}`;
    } catch (e) {
        return dateStr;
    }
}

// ==================== 메뉴 전환 로직 ====================
const toolMap = {
    converter:       converterTool,
    imageCompressor: imageCompressorTool,
    compressor:      compressorTool,
    merger:          mergerTool,
    splitter:        splitterTool,
    pageEditor:      pageEditorTool,
    metadata:        metadataTool,
    watermark:       watermarkTool,
};

function switchTool(toolName) {
    Object.values(toolMap).forEach(t => t.classList.add('hidden'));
    if (toolMap[toolName]) toolMap[toolName].classList.remove('hidden');

    navItems.forEach(item => {
        item.classList.remove('active');
        if (item.dataset.tool === toolName) item.classList.add('active');
    });

    closeMobileMenu();
}

// ==================== 모바일 메뉴 ====================
function openMobileMenu() {
    sidebar.classList.add('open');
    sidebarOverlay.classList.add('active');
    hamburgerBtn.classList.add('active');
}

function closeMobileMenu() {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('active');
    hamburgerBtn.classList.remove('active');
}

function toggleMobileMenu() {
    if (sidebar.classList.contains('open')) {
        closeMobileMenu();
    } else {
        openMobileMenu();
    }
}

// ==================== 이벤트 리스너 설정 ====================
function setupEventListeners() {
    // 메뉴 전환
    navItems.forEach(item => {
        item.addEventListener('click', () => switchTool(item.dataset.tool));
    });

    // 모바일 메뉴
    hamburgerBtn.addEventListener('click', toggleMobileMenu);
    sidebarOverlay.addEventListener('click', closeMobileMenu);

    // ========== 이미지 변환 이벤트 ==========
    selectFileBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);

    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type === 'application/pdf') loadPDF(files[0]);
    });

    removeFileBtn.addEventListener('click', resetAll);

    document.querySelectorAll('input[name="format"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            qualityGroup.classList.toggle('hidden', e.target.value === 'png');
        });
    });

    qualitySlider.addEventListener('input', () => { qualityValue.textContent = qualitySlider.value; });
    scaleSlider.addEventListener('input', () => { scaleValue.textContent = scaleSlider.value; });

    document.querySelectorAll('input[name="pageRange"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            customRangeInput.classList.toggle('hidden', e.target.value !== 'custom');
        });
    });

    convertBtn.addEventListener('click', startConversion);
    downloadZipBtn.addEventListener('click', downloadAsZip);
    downloadIndividualBtn.addEventListener('click', toggleIndividualLinks);

    // ========== 이미지 압축 이벤트 ==========
    imgCompressSelectBtn.addEventListener('click', (e) => { e.stopPropagation(); imgCompressFileInput.click(); });
    imgCompressDropZone.addEventListener('click', () => imgCompressFileInput.click());
    imgCompressFileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files).filter(isImageFile);
        if (files.length > 0) addImgCompressFiles(files);
        imgCompressFileInput.value = '';
    });

    imgCompressDropZone.addEventListener('dragover', (e) => { e.preventDefault(); imgCompressDropZone.classList.add('drag-over'); });
    imgCompressDropZone.addEventListener('dragleave', () => imgCompressDropZone.classList.remove('drag-over'));
    imgCompressDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        imgCompressDropZone.classList.remove('drag-over');
        const files = Array.from(e.dataTransfer.files).filter(isImageFile);
        if (files.length > 0) addImgCompressFiles(files);
    });

    imgCompressAddMoreBtn.addEventListener('click', () => imgCompressAddMoreInput.click());
    imgCompressAddMoreInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files).filter(isImageFile);
        if (files.length > 0) addImgCompressFiles(files);
        imgCompressAddMoreInput.value = '';
    });

    imgCompressBtn.addEventListener('click', startImgCompression);
    imgCompressDownloadZipBtn.addEventListener('click', downloadImgCompressZip);

    // ========== PDF 압축 이벤트 ==========
    compressSelectFileBtn.addEventListener('click', (e) => { e.stopPropagation(); compressFileInput.click(); });
    compressDropZone.addEventListener('click', () => compressFileInput.click());
    compressFileInput.addEventListener('change', handleCompressFileSelect);

    compressDropZone.addEventListener('dragover', (e) => { e.preventDefault(); compressDropZone.classList.add('drag-over'); });
    compressDropZone.addEventListener('dragleave', () => compressDropZone.classList.remove('drag-over'));
    compressDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        compressDropZone.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type === 'application/pdf') loadCompressPDF(files[0]);
    });

    compressRemoveFileBtn.addEventListener('click', resetCompressAll);
    compressScaleSlider.addEventListener('input', () => { compressScaleValue.textContent = compressScaleSlider.value; });
    compressBtn.addEventListener('click', startCompression);
    downloadCompressedBtn.addEventListener('click', downloadCompressedPDF);

    // ========== PDF 병합 이벤트 ==========
    mergeSelectFilesBtn.addEventListener('click', (e) => { e.stopPropagation(); mergeFileInput.click(); });
    mergeDropZone.addEventListener('click', () => mergeFileInput.click());
    mergeFileInput.addEventListener('change', handleMergeFilesSelect);

    mergeDropZone.addEventListener('dragover', (e) => { e.preventDefault(); mergeDropZone.classList.add('drag-over'); });
    mergeDropZone.addEventListener('dragleave', () => mergeDropZone.classList.remove('drag-over'));
    mergeDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        mergeDropZone.classList.remove('drag-over');
        const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
        if (files.length > 0) addMergeFiles(files);
    });

    mergeAddMoreBtn.addEventListener('click', () => mergeAddMoreInput.click());
    mergeAddMoreInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files).filter(f => f.type === 'application/pdf');
        if (files.length > 0) addMergeFiles(files);
        mergeAddMoreInput.value = '';
    });

    mergeBtn.addEventListener('click', startMerge);
    downloadMergedBtn.addEventListener('click', () => {
        if (mergedPdfBlob) saveAs(mergedPdfBlob, 'merged.pdf');
    });

    // ========== PDF 분할 이벤트 ==========
    splitSelectFileBtn.addEventListener('click', (e) => { e.stopPropagation(); splitFileInput.click(); });
    splitDropZone.addEventListener('click', () => splitFileInput.click());
    splitFileInput.addEventListener('change', handleSplitFileSelect);

    splitDropZone.addEventListener('dragover', (e) => { e.preventDefault(); splitDropZone.classList.add('drag-over'); });
    splitDropZone.addEventListener('dragleave', () => splitDropZone.classList.remove('drag-over'));
    splitDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        splitDropZone.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type === 'application/pdf') loadSplitPDF(files[0]);
    });

    splitRemoveFileBtn.addEventListener('click', resetSplitAll);

    document.querySelectorAll('input[name="splitType"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            splitRangesGroup.classList.toggle('hidden', e.target.value !== 'ranges');
        });
    });

    splitBtn.addEventListener('click', startSplit);

    downloadSplitZipBtn.addEventListener('click', downloadSplitAsZip);

    // ========== 페이지 편집 이벤트 ==========
    pageEditorSelectFileBtn.addEventListener('click', (e) => { e.stopPropagation(); pageEditorFileInput.click(); });
    pageEditorDropZone.addEventListener('click', () => pageEditorFileInput.click());
    pageEditorFileInput.addEventListener('change', handlePageEditorFileSelect);

    pageEditorDropZone.addEventListener('dragover', (e) => { e.preventDefault(); pageEditorDropZone.classList.add('drag-over'); });
    pageEditorDropZone.addEventListener('dragleave', () => pageEditorDropZone.classList.remove('drag-over'));
    pageEditorDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        pageEditorDropZone.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type === 'application/pdf') loadPageEditorPDF(files[0]);
    });

    pageEditorRemoveFileBtn.addEventListener('click', resetPageEditor);
    savePageEditorBtn.addEventListener('click', savePageEditor);
    downloadPageEditorBtn.addEventListener('click', () => {
        if (pageEditorResultBlob) saveAs(pageEditorResultBlob, `${pageEditorFileName}_edited.pdf`);
    });

    // ========== 메타데이터 이벤트 ==========
    metaSelectFileBtn.addEventListener('click', (e) => { e.stopPropagation(); metaFileInput.click(); });
    metaDropZone.addEventListener('click', () => metaFileInput.click());
    metaFileInput.addEventListener('change', handleMetaFileSelect);

    metaDropZone.addEventListener('dragover', (e) => { e.preventDefault(); metaDropZone.classList.add('drag-over'); });
    metaDropZone.addEventListener('dragleave', () => metaDropZone.classList.remove('drag-over'));
    metaDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        metaDropZone.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type === 'application/pdf') loadMetadataPDF(files[0]);
    });

    metaRemoveFileBtn.addEventListener('click', resetMetadata);

    // ========== 워터마크 이벤트 ==========
    watermarkSelectFileBtn.addEventListener('click', (e) => { e.stopPropagation(); watermarkFileInput.click(); });
    watermarkDropZone.addEventListener('click', () => watermarkFileInput.click());
    watermarkFileInput.addEventListener('change', handleWatermarkFileSelect);

    watermarkDropZone.addEventListener('dragover', (e) => { e.preventDefault(); watermarkDropZone.classList.add('drag-over'); });
    watermarkDropZone.addEventListener('dragleave', () => watermarkDropZone.classList.remove('drag-over'));
    watermarkDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        watermarkDropZone.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type === 'application/pdf') loadWatermarkPDF(files[0]);
    });

    watermarkRemoveFileBtn.addEventListener('click', resetWatermark);

    document.querySelectorAll('input[name="watermarkType"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            textWatermarkOptions.classList.toggle('hidden', e.target.value !== 'text');
            imageWatermarkOptions.classList.toggle('hidden', e.target.value !== 'image');
        });
    });

    watermarkFontSize.addEventListener('input', () => { watermarkFontSizeValue.textContent = watermarkFontSize.value; });
    watermarkOpacity.addEventListener('input', () => { watermarkOpacityValue.textContent = parseFloat(watermarkOpacity.value).toFixed(2); });
    watermarkAngle.addEventListener('input', () => { watermarkAngleValue.textContent = watermarkAngle.value; });
    watermarkImgOpacity.addEventListener('input', () => { watermarkImgOpacityValue.textContent = parseFloat(watermarkImgOpacity.value).toFixed(2); });
    watermarkImgSize.addEventListener('input', () => { watermarkImgSizeValue.textContent = watermarkImgSize.value; });

    applyWatermarkBtn.addEventListener('click', applyWatermark);
    downloadWatermarkedBtn.addEventListener('click', () => {
        if (watermarkedPdfBlob) saveAs(watermarkedPdfBlob, `${watermarkPdfFileName}_watermarked.pdf`);
    });
}

// ==================== 이미지 변환 기능 ====================
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') loadPDF(file);
}

async function loadPDF(file) {
    try {
        pdfFileName = file.name.replace('.pdf', '');
        const arrayBuffer = await file.arrayBuffer();
        pdfDocument = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        fileName.textContent = file.name;
        pageCount.textContent = `${pdfDocument.numPages} 페이지`;

        dropZone.classList.add('hidden');
        fileInfo.classList.remove('hidden');
        settingsPanel.classList.remove('hidden');

        hideResults();
    } catch (error) {
        console.error('PDF 로드 실패:', error);
        alert('PDF 파일을 로드하는데 실패했습니다.');
    }
}

function resetAll() {
    pdfDocument = null;
    convertedImages = [];
    pdfFileName = '';
    fileInput.value = '';

    dropZone.classList.remove('hidden');
    fileInfo.classList.add('hidden');
    settingsPanel.classList.add('hidden');

    hideResults();
}

function hideResults() {
    progressContainer.classList.add('hidden');
    previewArea.classList.add('hidden');
    downloadSection.classList.add('hidden');
    individualLinks.classList.add('hidden');
    convertedImages = [];
}

function parsePageRange(rangeStr, maxPages) {
    const pages = new Set();
    const parts = rangeStr.split(',').map(s => s.trim());

    for (const part of parts) {
        if (part.includes('-')) {
            const [start, end] = part.split('-').map(n => parseInt(n.trim()));
            if (!isNaN(start) && !isNaN(end)) {
                for (let i = Math.max(1, start); i <= Math.min(maxPages, end); i++) {
                    pages.add(i);
                }
            }
        } else {
            const pageNum = parseInt(part);
            if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= maxPages) {
                pages.add(pageNum);
            }
        }
    }

    return Array.from(pages).sort((a, b) => a - b);
}

async function startConversion() {
    if (!pdfDocument) return;

    const format = document.querySelector('input[name="format"]:checked').value;
    const quality = parseFloat(qualitySlider.value);
    const scale = parseFloat(scaleSlider.value);
    const rangeType = document.querySelector('input[name="pageRange"]:checked').value;

    let pagesToConvert = [];
    if (rangeType === 'all') {
        for (let i = 1; i <= pdfDocument.numPages; i++) pagesToConvert.push(i);
    } else {
        const rangeStr = pageRangeInput.value.trim();
        if (!rangeStr) { alert('페이지 범위를 입력해주세요.'); return; }
        pagesToConvert = parsePageRange(rangeStr, pdfDocument.numPages);
        if (pagesToConvert.length === 0) { alert('유효한 페이지 범위를 입력해주세요.'); return; }
    }

    convertBtn.disabled = true;
    progressContainer.classList.remove('hidden');
    hideResults();
    progressContainer.classList.remove('hidden');

    convertedImages = [];

    try {
        for (let i = 0; i < pagesToConvert.length; i++) {
            const pageNum = pagesToConvert[i];
            updateProgress(Math.round(((i + 1) / pagesToConvert.length) * 100));
            const imageData = await renderPage(pageNum, format, quality, scale);
            convertedImages.push({ pageNum, data: imageData, format: format === 'jpeg' ? 'jpg' : 'png' });
        }
        showResults();
    } catch (error) {
        console.error('변환 실패:', error);
        alert('페이지 변환 중 오류가 발생했습니다.');
    } finally {
        convertBtn.disabled = false;
    }
}

async function renderPage(pageNum, format, quality, scale) {
    const page = await pdfDocument.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: context, viewport }).promise;

    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    return canvas.toDataURL(mimeType, format === 'jpeg' ? quality : undefined);
}

function updateProgress(percent) {
    progressFill.style.width = `${percent}%`;
    progressText.textContent = `${percent}%`;
}

function showResults() {
    if (convertedImages.length === 0) return;

    firstPagePreview.src = convertedImages[0].data;
    lastPagePreview.src = convertedImages[convertedImages.length - 1].data;

    previewArea.classList.remove('hidden');
    downloadSection.classList.remove('hidden');

    generateIndividualLinks();
}

function generateIndividualLinks() {
    linksList.innerHTML = '';
    convertedImages.forEach((img) => {
        const link = document.createElement('a');
        link.href = img.data;
        link.download = `${pdfFileName}_page_${img.pageNum}.${img.format}`;
        link.className = 'page-link';
        link.textContent = `페이지 ${img.pageNum}`;
        linksList.appendChild(link);
    });
}

function toggleIndividualLinks() {
    individualLinks.classList.toggle('hidden');
}

async function downloadAsZip() {
    if (convertedImages.length === 0) return;

    downloadZipBtn.disabled = true;
    downloadZipBtn.textContent = 'ZIP 생성 중...';

    try {
        const zip = new JSZip();
        for (const img of convertedImages) {
            const base64Data = img.data.split(',')[1];
            const fName = `${pdfFileName}_page_${img.pageNum}.${img.format}`;
            zip.file(fName, base64Data, { base64: true });
        }
        const blob = await zip.generateAsync({ type: 'blob' });
        saveAs(blob, `${pdfFileName}_images.zip`);
    } catch (error) {
        console.error('ZIP 생성 실패:', error);
        alert('ZIP 파일 생성 중 오류가 발생했습니다.');
    } finally {
        downloadZipBtn.disabled = false;
        downloadZipBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            ZIP으로 다운로드
        `;
    }
}

// ==================== PDF 압축 기능 ====================
function handleCompressFileSelect(e) {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') loadCompressPDF(file);
}

async function loadCompressPDF(file) {
    try {
        compressPdfFileName = file.name.replace('.pdf', '');
        compressPdfOriginalSize = file.size;

        const arrayBuffer = await file.arrayBuffer();
        compressPdfDocument = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        compressFileName.textContent = file.name;
        compressFileSize.textContent = formatFileSize(file.size);
        compressPageCount.textContent = `${compressPdfDocument.numPages} 페이지`;

        compressDropZone.classList.add('hidden');
        compressFileInfo.classList.remove('hidden');
        compressSettingsPanel.classList.remove('hidden');

        hideCompressResults();
    } catch (error) {
        console.error('PDF 로드 실패:', error);
        alert('PDF 파일을 로드하는데 실패했습니다.');
    }
}

function resetCompressAll() {
    compressPdfDocument = null;
    compressPdfFileName = '';
    compressPdfOriginalSize = 0;
    compressedPdfBlob = null;
    compressFileInput.value = '';

    compressDropZone.classList.remove('hidden');
    compressFileInfo.classList.add('hidden');
    compressSettingsPanel.classList.add('hidden');

    hideCompressResults();
}

function hideCompressResults() {
    compressProgressContainer.classList.add('hidden');
    compressResultSection.classList.add('hidden');
    compressedPdfBlob = null;
}

function updateCompressProgress(percent) {
    compressProgressFill.style.width = `${percent}%`;
    compressProgressText.textContent = `${percent}%`;
}

async function startCompression() {
    if (!compressPdfDocument) return;

    const compressionLevel = parseFloat(document.querySelector('input[name="compressionLevel"]:checked').value);
    const scale = parseFloat(compressScaleSlider.value);
    const numPages = compressPdfDocument.numPages;

    compressBtn.disabled = true;
    compressProgressContainer.classList.remove('hidden');
    compressResultSection.classList.add('hidden');

    try {
        const firstPage = await compressPdfDocument.getPage(1);
        const viewport = firstPage.getViewport({ scale });

        const pdf = new jsPDF({
            orientation: viewport.width > viewport.height ? 'landscape' : 'portrait',
            unit: 'pt',
            format: [viewport.width, viewport.height]
        });

        for (let i = 1; i <= numPages; i++) {
            updateCompressProgress(Math.round((i / numPages) * 100));

            const page = await compressPdfDocument.getPage(i);
            const pageViewport = page.getViewport({ scale });

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = pageViewport.width;
            canvas.height = pageViewport.height;

            await page.render({ canvasContext: context, viewport: pageViewport }).promise;

            const imageData = canvas.toDataURL('image/jpeg', compressionLevel);

            if (i > 1) {
                pdf.addPage([pageViewport.width, pageViewport.height],
                    pageViewport.width > pageViewport.height ? 'landscape' : 'portrait');
            }
            pdf.addImage(imageData, 'JPEG', 0, 0, pageViewport.width, pageViewport.height);
        }

        compressedPdfBlob = pdf.output('blob');
        showCompressResults();
    } catch (error) {
        console.error('압축 실패:', error);
        alert('PDF 압축 중 오류가 발생했습니다.');
    } finally {
        compressBtn.disabled = false;
    }
}

function showCompressResults() {
    if (!compressedPdfBlob) return;

    const compressedSize = compressedPdfBlob.size;
    const savings = ((compressPdfOriginalSize - compressedSize) / compressPdfOriginalSize * 100);

    originalSizeEl.textContent = formatFileSize(compressPdfOriginalSize);
    compressedSizeEl.textContent = formatFileSize(compressedSize);

    if (savings > 0) {
        savingsPercentEl.textContent = `-${savings.toFixed(1)}%`;
        savingsPercentEl.style.color = '#28a745';
    } else {
        savingsPercentEl.textContent = `+${Math.abs(savings).toFixed(1)}%`;
        savingsPercentEl.style.color = '#dc3545';
    }

    compressResultSection.classList.remove('hidden');
}

function downloadCompressedPDF() {
    if (!compressedPdfBlob) return;
    saveAs(compressedPdfBlob, `${compressPdfFileName}_compressed.pdf`);
}

// ==================== PDF 병합 기능 ====================
function handleMergeFilesSelect(e) {
    const files = Array.from(e.target.files).filter(f => f.type === 'application/pdf');
    if (files.length > 0) addMergeFiles(files);
    mergeFileInput.value = '';
}

async function addMergeFiles(files) {
    for (const file of files) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            mergeFiles.push({ file, name: file.name, pageCount: doc.numPages });
        } catch (e) {
            console.error(`${file.name} 로드 실패:`, e);
        }
    }
    renderMergeFileList();
    mergeDropZone.classList.add('hidden');
    mergeFileListSection.classList.remove('hidden');
    mergeResultSection.classList.add('hidden');
    mergedPdfBlob = null;
}

function renderMergeFileList() {
    mergeFileCount.textContent = mergeFiles.length;
    mergeFileList.innerHTML = '';

    mergeFiles.forEach((item, idx) => {
        const el = document.createElement('div');
        el.className = 'merge-file-item';
        el.innerHTML = `
            <span class="merge-file-order">${idx + 1}</span>
            <span class="merge-file-name" title="${item.name}">${item.name}</span>
            <span class="merge-file-pages">${item.pageCount}p</span>
            <div class="merge-file-controls">
                <button class="merge-move-btn" data-action="up" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''}>▲</button>
                <button class="merge-move-btn" data-action="down" data-idx="${idx}" ${idx === mergeFiles.length - 1 ? 'disabled' : ''}>▼</button>
                <button class="merge-remove-btn" data-idx="${idx}">✕</button>
            </div>
        `;
        mergeFileList.appendChild(el);
    });

    // 이동 및 삭제 버튼 이벤트
    mergeFileList.querySelectorAll('.merge-move-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx);
            const action = btn.dataset.action;
            if (action === 'up' && idx > 0) {
                [mergeFiles[idx - 1], mergeFiles[idx]] = [mergeFiles[idx], mergeFiles[idx - 1]];
            } else if (action === 'down' && idx < mergeFiles.length - 1) {
                [mergeFiles[idx], mergeFiles[idx + 1]] = [mergeFiles[idx + 1], mergeFiles[idx]];
            }
            renderMergeFileList();
        });
    });

    mergeFileList.querySelectorAll('.merge-remove-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            mergeFiles.splice(parseInt(btn.dataset.idx), 1);
            if (mergeFiles.length === 0) {
                mergeDropZone.classList.remove('hidden');
                mergeFileListSection.classList.add('hidden');
            }
            renderMergeFileList();
        });
    });
}

async function startMerge() {
    if (mergeFiles.length < 2) {
        alert('2개 이상의 파일을 선택해주세요.');
        return;
    }

    mergeBtn.disabled = true;
    mergeProgressContainer.classList.remove('hidden');
    mergeResultSection.classList.add('hidden');

    try {
        const { PDFDocument } = PDFLib;
        const mergedPdf = await PDFDocument.create();

        for (let i = 0; i < mergeFiles.length; i++) {
            const pct = Math.round(((i + 1) / mergeFiles.length) * 100);
            mergeProgressFill.style.width = `${pct}%`;
            mergeProgressText.textContent = `${pct}%`;

            const arrayBuffer = await mergeFiles[i].file.arrayBuffer();
            const srcPdf = await PDFDocument.load(arrayBuffer);
            const pages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices());
            pages.forEach(p => mergedPdf.addPage(p));
        }

        const bytes = await mergedPdf.save();
        mergedPdfBlob = new Blob([bytes], { type: 'application/pdf' });

        const totalPages = mergeFiles.reduce((sum, f) => sum + f.pageCount, 0);
        mergeTotalPages.textContent = `${totalPages} 페이지`;
        mergeTotalSize.textContent = formatFileSize(mergedPdfBlob.size);
        mergeResultSection.classList.remove('hidden');
    } catch (error) {
        console.error('병합 실패:', error);
        alert('PDF 병합 중 오류가 발생했습니다.');
    } finally {
        mergeBtn.disabled = false;
    }
}

// ==================== PDF 분할 기능 ====================
function handleSplitFileSelect(e) {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') loadSplitPDF(file);
}

async function loadSplitPDF(file) {
    try {
        splitPdfFileName = file.name.replace('.pdf', '');
        splitPdfFile = file;

        const arrayBuffer = await file.arrayBuffer();
        splitPdfDocument = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        splitFileName.textContent = file.name;
        splitPageCount.textContent = `${splitPdfDocument.numPages} 페이지`;

        splitDropZone.classList.add('hidden');
        splitFileInfo.classList.remove('hidden');
        splitSettingsPanel.classList.remove('hidden');

        splitResultSection.classList.add('hidden');
        splitResultBlobs = [];
    } catch (error) {
        console.error('PDF 로드 실패:', error);
        alert('PDF 파일을 로드하는데 실패했습니다.');
    }
}

function resetSplitAll() {
    splitPdfFile = null;
    splitPdfDocument = null;
    splitPdfFileName = '';
    splitResultBlobs = [];
    splitFileInput.value = '';

    splitDropZone.classList.remove('hidden');
    splitFileInfo.classList.add('hidden');
    splitSettingsPanel.classList.add('hidden');
    splitProgressContainer.classList.add('hidden');
    splitResultSection.classList.add('hidden');
}

function parseSplitRange(rangeStr, maxPages) {
    const pages = new Set();
    const parts = rangeStr.split(',').map(s => s.trim());
    for (const part of parts) {
        if (part.includes('-')) {
            const [s, e] = part.split('-').map(n => parseInt(n.trim()));
            if (!isNaN(s) && !isNaN(e)) {
                for (let i = Math.max(0, s - 1); i < Math.min(maxPages, e); i++) pages.add(i);
            }
        } else {
            const n = parseInt(part);
            if (!isNaN(n) && n >= 1 && n <= maxPages) pages.add(n - 1);
        }
    }
    return Array.from(pages).sort((a, b) => a - b);
}

async function startSplit() {
    if (!splitPdfFile) return;

    const splitType = document.querySelector('input[name="splitType"]:checked').value;

    splitBtn.disabled = true;
    splitProgressContainer.classList.remove('hidden');
    splitResultSection.classList.add('hidden');

    try {
        const { PDFDocument } = PDFLib;
        const arrayBuffer = await splitPdfFile.arrayBuffer();
        const srcPdf = await PDFDocument.load(arrayBuffer);
        const numPages = srcPdf.getPageCount();

        let pageGroups = [];

        if (splitType === 'perPage') {
            for (let i = 0; i < numPages; i++) pageGroups.push([i]);
        } else {
            const lines = splitRangesText.value.split('\n').map(l => l.trim()).filter(l => l);
            if (lines.length === 0) {
                alert('범위를 입력해주세요.');
                splitBtn.disabled = false;
                return;
            }
            for (const line of lines) {
                const indices = parseSplitRange(line, numPages);
                if (indices.length > 0) pageGroups.push(indices);
            }
        }

        splitResultBlobs = [];

        for (let i = 0; i < pageGroups.length; i++) {
            const pct = Math.round(((i + 1) / pageGroups.length) * 100);
            splitProgressFill.style.width = `${pct}%`;
            splitProgressText.textContent = `${pct}%`;

            const newPdf = await PDFDocument.create();
            const pages = await newPdf.copyPages(srcPdf, pageGroups[i]);
            pages.forEach(p => newPdf.addPage(p));
            const bytes = await newPdf.save();

            let name;
            if (splitType === 'perPage') {
                name = `${splitPdfFileName}_page_${pageGroups[i][0] + 1}.pdf`;
            } else {
                const first = pageGroups[i][0] + 1;
                const last = pageGroups[i][pageGroups[i].length - 1] + 1;
                name = first === last
                    ? `${splitPdfFileName}_page_${first}.pdf`
                    : `${splitPdfFileName}_p${first}-p${last}.pdf`;
            }

            splitResultBlobs.push({ blob: new Blob([bytes], { type: 'application/pdf' }), name });
        }

        showSplitResults();
    } catch (error) {
        console.error('분할 실패:', error);
        alert('PDF 분할 중 오류가 발생했습니다.');
    } finally {
        splitBtn.disabled = false;
    }
}

function showSplitResults() {
    splitResultInfo.textContent = `${splitResultBlobs.length}개의 파일로 분할되었습니다`;

    splitLinksList.innerHTML = '';
    splitResultBlobs.forEach(({ blob, name }) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        link.className = 'page-link';
        link.textContent = name;
        splitLinksList.appendChild(link);
    });

    splitResultSection.classList.remove('hidden');
}

async function downloadSplitAsZip() {
    if (splitResultBlobs.length === 0) return;

    downloadSplitZipBtn.disabled = true;
    downloadSplitZipBtn.textContent = 'ZIP 생성 중...';

    try {
        const zip = new JSZip();
        for (const { blob, name } of splitResultBlobs) {
            const arrayBuffer = await blob.arrayBuffer();
            zip.file(name, arrayBuffer);
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        saveAs(zipBlob, `${splitPdfFileName}_split.zip`);
    } catch (error) {
        console.error('ZIP 생성 실패:', error);
        alert('ZIP 파일 생성 중 오류가 발생했습니다.');
    } finally {
        downloadSplitZipBtn.disabled = false;
        downloadSplitZipBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            ZIP으로 다운로드
        `;
    }
}

// ==================== 페이지 편집 기능 ====================
function handlePageEditorFileSelect(e) {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') loadPageEditorPDF(file);
}

async function loadPageEditorPDF(file) {
    try {
        pageEditorFileName = file.name.replace('.pdf', '');
        pageEditorFile = file;

        const arrayBuffer = await file.arrayBuffer();
        pageEditorDocument = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        pageEditorFileNameEl.textContent = file.name;
        pageEditorPageCountEl.textContent = `${pageEditorDocument.numPages} 페이지`;

        pageEditorDropZone.classList.add('hidden');
        pageEditorFileInfo.classList.remove('hidden');
        pageEditorPanel.classList.add('hidden');
        pageEditorResultSection.classList.add('hidden');
        pageEditorLoading.classList.remove('hidden');

        await renderAllThumbnails();

        pageEditorLoading.classList.add('hidden');
        pageEditorPanel.classList.remove('hidden');
        updateEditorPageCount();
    } catch (error) {
        console.error('PDF 로드 실패:', error);
        alert('PDF 파일을 로드하는데 실패했습니다.');
        pageEditorLoading.classList.add('hidden');
    }
}

async function renderAllThumbnails() {
    pageEditorPages = [];
    const numPages = pageEditorDocument.numPages;
    const scale = 0.35;

    for (let i = 1; i <= numPages; i++) {
        const page = await pageEditorDocument.getPage(i);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        pageEditorPages.push({ originalIndex: i - 1, dataUrl: canvas.toDataURL() });
    }

    renderPageGrid();
}

function renderPageGrid() {
    pageGrid.innerHTML = '';
    pageEditorPages.forEach((page, idx) => {
        const card = document.createElement('div');
        card.className = 'page-card';
        card.draggable = true;
        card.dataset.idx = idx;
        card.innerHTML = `
            <div class="page-card-header">
                <span class="page-card-number">${idx + 1}</span>
                <button class="delete-page-btn" title="삭제">✕</button>
            </div>
            <img class="page-thumbnail" src="${page.dataUrl}" alt="페이지 ${idx + 1}" draggable="false">
            <div class="page-card-footer">원본 ${page.originalIndex + 1}p</div>
        `;

        card.addEventListener('dragstart', handlePageDragStart);
        card.addEventListener('dragover', handlePageDragOver);
        card.addEventListener('dragleave', handlePageDragLeave);
        card.addEventListener('drop', handlePageDrop);
        card.addEventListener('dragend', handlePageDragEnd);

        card.querySelector('.delete-page-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const cardIdx = parseInt(card.dataset.idx);
            pageEditorPages.splice(cardIdx, 1);
            renderPageGrid();
            updateEditorPageCount();
        });

        pageGrid.appendChild(card);
    });
}

function updateEditorPageCount() {
    pageEditorCount.textContent = `${pageEditorPages.length} 페이지`;
}

function handlePageDragStart(e) {
    dragSrcIdx = parseInt(this.dataset.idx);
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handlePageDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    this.classList.add('drag-over');
}

function handlePageDragLeave() {
    this.classList.remove('drag-over');
}

function handlePageDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const targetIdx = parseInt(this.dataset.idx);
    if (dragSrcIdx !== null && dragSrcIdx !== targetIdx) {
        const [moved] = pageEditorPages.splice(dragSrcIdx, 1);
        pageEditorPages.splice(targetIdx, 0, moved);
        renderPageGrid();
        updateEditorPageCount();
    }
    this.classList.remove('drag-over');
    dragSrcIdx = null;
}

function handlePageDragEnd() {
    this.classList.remove('dragging');
    document.querySelectorAll('.page-card').forEach(c => c.classList.remove('drag-over'));
    dragSrcIdx = null;
}

function resetPageEditor() {
    pageEditorFile = null;
    pageEditorDocument = null;
    pageEditorFileName = '';
    pageEditorPages = [];
    pageEditorResultBlob = null;
    pageEditorFileInput.value = '';

    pageEditorDropZone.classList.remove('hidden');
    pageEditorFileInfo.classList.add('hidden');
    pageEditorLoading.classList.add('hidden');
    pageEditorPanel.classList.add('hidden');
    pageEditorResultSection.classList.add('hidden');
    pageGrid.innerHTML = '';
}

async function savePageEditor() {
    if (pageEditorPages.length === 0) {
        alert('저장할 페이지가 없습니다.');
        return;
    }

    savePageEditorBtn.disabled = true;
    savePageEditorBtn.textContent = '저장 중...';

    try {
        const { PDFDocument } = PDFLib;
        const arrayBuffer = await pageEditorFile.arrayBuffer();
        const srcPdf = await PDFDocument.load(arrayBuffer);

        const newPdf = await PDFDocument.create();
        const indices = pageEditorPages.map(p => p.originalIndex);
        const pages = await newPdf.copyPages(srcPdf, indices);
        pages.forEach(p => newPdf.addPage(p));

        const bytes = await newPdf.save();
        pageEditorResultBlob = new Blob([bytes], { type: 'application/pdf' });
        pageEditorResultSection.classList.remove('hidden');
        pageEditorResultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
        console.error('저장 실패:', error);
        alert('PDF 저장 중 오류가 발생했습니다.');
    } finally {
        savePageEditorBtn.disabled = false;
        savePageEditorBtn.textContent = '저장하기';
    }
}

// ==================== 메타데이터 기능 ====================
function handleMetaFileSelect(e) {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') loadMetadataPDF(file);
}

async function loadMetadataPDF(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        metadataPdfDocument = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        metaFileNameEl.textContent = file.name;

        metaDropZone.classList.add('hidden');
        metaFileInfo.classList.remove('hidden');

        const metadata = await metadataPdfDocument.getMetadata();
        displayMetadata(metadata, file);
    } catch (error) {
        console.error('메타데이터 로드 실패:', error);
        alert('PDF 파일을 로드하는데 실패했습니다.');
    }
}

function displayMetadata(metadata, file) {
    const info = metadata.info || {};

    const rows = [
        { label: '파일명',      value: file.name },
        { label: '파일 크기',   value: formatFileSize(file.size) },
        { label: '총 페이지',   value: `${metadataPdfDocument.numPages} 페이지` },
        { label: 'PDF 버전',    value: info.PDFFormatVersion || '-' },
        { label: '제목',        value: info.Title   || '-' },
        { label: '작성자',      value: info.Author  || '-' },
        { label: '주제',        value: info.Subject || '-' },
        { label: '키워드',      value: info.Keywords || '-' },
        { label: '생성 프로그램', value: info.Creator  || '-' },
        { label: '변환 프로그램', value: info.Producer || '-' },
        { label: '생성일',      value: formatPdfDate(info.CreationDate) },
        { label: '수정일',      value: formatPdfDate(info.ModDate) },
        { label: '암호화',      value: info.IsEncrypted ? '예' : '아니오' },
        { label: '서명',        value: info.IsSignaturesPresent ? '있음' : '없음' },
    ];

    metadataTableBody.innerHTML = rows
        .map(row => `<tr><th>${row.label}</th><td>${row.value}</td></tr>`)
        .join('');

    metadataPanel.classList.remove('hidden');
}

function resetMetadata() {
    metadataPdfDocument = null;
    metaFileInput.value = '';

    metaDropZone.classList.remove('hidden');
    metaFileInfo.classList.add('hidden');
    metadataPanel.classList.add('hidden');
    metadataTableBody.innerHTML = '';
}

// ==================== 워터마크 기능 ====================
function handleWatermarkFileSelect(e) {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') loadWatermarkPDF(file);
}

async function loadWatermarkPDF(file) {
    try {
        watermarkPdfFileName = file.name.replace('.pdf', '');
        watermarkPdfFile = file;

        const arrayBuffer = await file.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        watermarkFileNameEl.textContent = file.name;
        watermarkPageCountEl.textContent = `${doc.numPages} 페이지`;

        watermarkDropZone.classList.add('hidden');
        watermarkFileInfo.classList.remove('hidden');
        watermarkSettingsPanel.classList.remove('hidden');
        watermarkResultSection.classList.add('hidden');
        watermarkedPdfBlob = null;
    } catch (error) {
        console.error('PDF 로드 실패:', error);
        alert('PDF 파일을 로드하는데 실패했습니다.');
    }
}

function resetWatermark() {
    watermarkPdfFile = null;
    watermarkPdfFileName = '';
    watermarkedPdfBlob = null;
    watermarkFileInput.value = '';

    watermarkDropZone.classList.remove('hidden');
    watermarkFileInfo.classList.add('hidden');
    watermarkSettingsPanel.classList.add('hidden');
    watermarkProgressContainer.classList.add('hidden');
    watermarkResultSection.classList.add('hidden');
}

async function applyWatermark() {
    if (!watermarkPdfFile) return;

    const watermarkType = document.querySelector('input[name="watermarkType"]:checked').value;

    applyWatermarkBtn.disabled = true;
    watermarkProgressContainer.classList.remove('hidden');
    watermarkResultSection.classList.add('hidden');

    try {
        const { PDFDocument, rgb, degrees, StandardFonts } = PDFLib;
        const arrayBuffer = await watermarkPdfFile.arrayBuffer();
        const pdf = await PDFDocument.load(arrayBuffer);
        const pages = pdf.getPages();

        if (watermarkType === 'text') {
            const text = watermarkText.value.trim() || 'WATERMARK';
            const fontSize = parseInt(watermarkFontSize.value);
            const opacity = parseFloat(watermarkOpacity.value);
            const angle = parseInt(watermarkAngle.value);
            const colorName = document.querySelector('input[name="watermarkColor"]:checked').value;

            const colorMap = {
                gray:  rgb(0.5,  0.5,  0.5),
                red:   rgb(0.8,  0,    0),
                blue:  rgb(0,    0,    0.8),
                black: rgb(0,    0,    0),
            };
            const color = colorMap[colorName] || colorMap.gray;

            const font = await pdf.embedFont(StandardFonts.HelveticaBold);
            const textWidth = font.widthOfTextAtSize(text, fontSize);

            for (let i = 0; i < pages.length; i++) {
                const pct = Math.round(((i + 1) / pages.length) * 90);
                watermarkProgressFill.style.width = `${pct}%`;
                watermarkProgressTextEl.textContent = `${pct}%`;

                const page = pages[i];
                const { width, height } = page.getSize();

                page.drawText(text, {
                    x: width / 2 - textWidth / 2,
                    y: height / 2 - fontSize / 2,
                    size: fontSize,
                    font,
                    color,
                    opacity,
                    rotate: degrees(angle),
                });
            }
        } else {
            // 이미지 워터마크
            const imageInput = document.getElementById('watermarkImageInput');
            if (!imageInput.files[0]) {
                alert('워터마크로 사용할 이미지를 선택해주세요.');
                applyWatermarkBtn.disabled = false;
                return;
            }

            const imgFile = imageInput.files[0];
            const imgArrayBuffer = await imgFile.arrayBuffer();
            const imgBytes = new Uint8Array(imgArrayBuffer);

            let embeddedImage;
            if (imgFile.type === 'image/png') {
                embeddedImage = await pdf.embedPng(imgBytes);
            } else {
                embeddedImage = await pdf.embedJpg(imgBytes);
            }

            const opacity = parseFloat(watermarkImgOpacity.value);
            const sizeRatio = parseInt(watermarkImgSize.value) / 100;

            for (let i = 0; i < pages.length; i++) {
                const pct = Math.round(((i + 1) / pages.length) * 90);
                watermarkProgressFill.style.width = `${pct}%`;
                watermarkProgressTextEl.textContent = `${pct}%`;

                const page = pages[i];
                const { width, height } = page.getSize();

                const imgW = width * sizeRatio;
                const imgH = imgW * (embeddedImage.height / embeddedImage.width);

                page.drawImage(embeddedImage, {
                    x: width / 2 - imgW / 2,
                    y: height / 2 - imgH / 2,
                    width: imgW,
                    height: imgH,
                    opacity,
                });
            }
        }

        watermarkProgressFill.style.width = '100%';
        watermarkProgressTextEl.textContent = '100%';

        const bytes = await pdf.save();
        watermarkedPdfBlob = new Blob([bytes], { type: 'application/pdf' });

        watermarkResultSection.classList.remove('hidden');
    } catch (error) {
        console.error('워터마크 적용 실패:', error);
        alert('워터마크 적용 중 오류가 발생했습니다.');
    } finally {
        applyWatermarkBtn.disabled = false;
    }
}

// ==================== 이미지 압축 기능 ====================
function isImageFile(f) {
    return f && /^image\/(jpeg|png|webp)$/.test(f.type);
}

function addImgCompressFiles(files) {
    files.forEach(f => imgCompressFiles.push({ file: f, name: f.name }));
    renderImgCompressFileList();
    imgCompressDropZone.classList.add('hidden');
    imgCompressFileListSection.classList.remove('hidden');
    imgCompressSettingsPanel.classList.remove('hidden');
    imgCompressResultSection.classList.add('hidden');
    imgCompressResults = [];
}

function renderImgCompressFileList() {
    imgCompressFileCount.textContent = imgCompressFiles.length;
    imgCompressFileList.innerHTML = '';
    imgCompressFiles.forEach((item, idx) => {
        const row = document.createElement('div');
        row.className = 'merge-file-item';
        row.innerHTML = `
            <span class="merge-file-order">${idx + 1}</span>
            <span class="merge-file-name">${item.name}</span>
            <span class="merge-file-pages">${formatFileSize(item.file.size)}</span>
            <button type="button" class="btn-icon merge-file-remove" data-idx="${idx}" title="제거">&times;</button>
        `;
        imgCompressFileList.appendChild(row);
    });
    imgCompressFileList.querySelectorAll('.merge-file-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            const i = parseInt(btn.dataset.idx, 10);
            imgCompressFiles.splice(i, 1);
            if (imgCompressFiles.length === 0) {
                resetImgCompress();
            } else {
                renderImgCompressFileList();
            }
        });
    });
}

function resetImgCompress() {
    imgCompressFiles = [];
    imgCompressResults = [];
    imgCompressDropZone.classList.remove('hidden');
    imgCompressFileListSection.classList.add('hidden');
    imgCompressSettingsPanel.classList.add('hidden');
    imgCompressResultSection.classList.add('hidden');
    imgCompressProgressContainer.classList.add('hidden');
}

function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
        img.src = url;
    });
}

function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), type, quality);
    });
}

function resolveOutputType(originalType, formatSetting) {
    if (formatSetting !== 'auto') return formatSetting;
    return originalType === 'image/png' ? 'image/png' : originalType;
}

function buildOutputName(originalName, outputType) {
    const dot = originalName.lastIndexOf('.');
    const base = dot >= 0 ? originalName.slice(0, dot) : originalName;
    const ext = outputType === 'image/jpeg' ? 'jpg'
              : outputType === 'image/webp' ? 'webp'
              : 'png';
    return `${base}_compressed.${ext}`;
}

async function startImgCompression() {
    if (imgCompressFiles.length === 0) return;

    const quality = parseFloat(document.querySelector('input[name="imgCompressQuality"]:checked').value);
    const maxWidth = parseInt(document.querySelector('input[name="imgCompressWidth"]:checked').value, 10);
    const formatSetting = document.querySelector('input[name="imgCompressFormat"]:checked').value;

    imgCompressBtn.disabled = true;
    imgCompressProgressContainer.classList.remove('hidden');
    imgCompressResultSection.classList.add('hidden');
    imgCompressResults = [];

    try {
        for (let i = 0; i < imgCompressFiles.length; i++) {
            const { file, name } = imgCompressFiles[i];
            const img = await loadImageFromFile(file);

            let targetW = img.naturalWidth;
            let targetH = img.naturalHeight;
            if (maxWidth > 0 && targetW > maxWidth) {
                const ratio = maxWidth / targetW;
                targetW = maxWidth;
                targetH = Math.round(img.naturalHeight * ratio);
            }

            const canvas = document.createElement('canvas');
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, targetW, targetH);

            const outputType = resolveOutputType(file.type, formatSetting);
            const blob = await canvasToBlob(canvas, outputType, quality);

            imgCompressResults.push({
                name: buildOutputName(name, outputType),
                blob,
                originalSize: file.size,
                compressedSize: blob ? blob.size : 0,
            });

            const pct = Math.round(((i + 1) / imgCompressFiles.length) * 100);
            imgCompressProgressFill.style.width = pct + '%';
            imgCompressProgressText.textContent = pct + '%';
        }

        renderImgCompressResults();
    } catch (error) {
        console.error('이미지 압축 실패:', error);
        alert('이미지 압축 중 오류가 발생했습니다.');
    } finally {
        imgCompressBtn.disabled = false;
    }
}

function renderImgCompressResults() {
    const totalOriginal = imgCompressResults.reduce((s, r) => s + r.originalSize, 0);
    const totalCompressed = imgCompressResults.reduce((s, r) => s + r.compressedSize, 0);
    const savings = totalOriginal > 0
        ? Math.round((1 - totalCompressed / totalOriginal) * 100)
        : 0;

    imgCompressOriginalTotal.textContent = formatFileSize(totalOriginal);
    imgCompressCompressedTotal.textContent = formatFileSize(totalCompressed);
    imgCompressSavings.textContent = savings + '%';

    imgCompressResultList.innerHTML = '';
    imgCompressResults.forEach((r, idx) => {
        const row = document.createElement('div');
        row.className = 'link-item';
        const diff = r.originalSize > 0
            ? Math.round((1 - r.compressedSize / r.originalSize) * 100)
            : 0;
        row.innerHTML = `
            <span class="link-name">${r.name}</span>
            <span class="link-meta">${formatFileSize(r.originalSize)} → ${formatFileSize(r.compressedSize)} (${diff}%↓)</span>
            <button type="button" class="btn btn-secondary btn-sm" data-idx="${idx}">다운로드</button>
        `;
        imgCompressResultList.appendChild(row);
    });
    imgCompressResultList.querySelectorAll('button[data-idx]').forEach(btn => {
        btn.addEventListener('click', () => {
            const r = imgCompressResults[parseInt(btn.dataset.idx, 10)];
            if (r && r.blob) saveAs(r.blob, r.name);
        });
    });

    imgCompressResultSection.classList.remove('hidden');
}

async function downloadImgCompressZip() {
    if (imgCompressResults.length === 0) return;
    const zip = new JSZip();
    imgCompressResults.forEach(r => {
        if (r.blob) zip.file(r.name, r.blob);
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, 'compressed_images.zip');
}

// ==================== 초기화 ====================
setupEventListeners();
