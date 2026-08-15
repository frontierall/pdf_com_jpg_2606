# PDF Tools

PDF와 PowerPoint 문서를 이미지로 변환하고, PDF 편집 및 이미지 최적화 작업을 제공하는 웹 도구입니다.

## 주요 기능

- PDF/PPTX를 JPG 또는 PNG로 변환
- 이미지 고해상도 변환 및 압축
- PDF 압축, 병합, 분할, 페이지 순서 편집
- PDF 메타데이터 확인 및 워터마크 적용
- 변환 이미지 개별 다운로드 또는 ZIP 일괄 다운로드

## PPTX 변환 방식

PPTX 파일은 브라우저에서 직접 렌더링하지 않습니다.

1. 브라우저가 PPTX를 `POST /api/convert/pptx-to-pdf`로 업로드합니다.
2. FastAPI 서버가 파일 크기와 PPTX 구조를 검증합니다.
3. LibreOffice Impress가 격리된 임시 프로필에서 PDF로 변환합니다.
4. 브라우저가 PDF.js로 각 슬라이드를 JPG/PNG로 렌더링합니다.
5. 사용자는 결과를 개별 이미지 또는 ZIP으로 다운로드합니다.

업로드된 원본과 중간 PDF는 요청 처리 후 삭제됩니다. PPTX 업로드 제한은 기본 50MB, 변환 제한 시간은 기본 120초입니다. 애니메이션, 영상 및 전환 효과는 정지된 슬라이드로 출력됩니다.

## 로컬 실행

### Docker 사용

Docker 이미지에는 LibreOffice, Pretendard 정적 TTF 9종과 Noto CJK 대체 글꼴이 포함됩니다.

```bash
docker build -t pdf-tools .
docker run --rm -p 8000:8000 pdf-tools
```

브라우저에서 <http://localhost:8000>을 엽니다.

### Python으로 실행

Python 3.11 이상과 LibreOffice가 필요합니다. Windows에서는 Pretendard가 사용자 글꼴로 설치되어 있어야 합니다.

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn server:app --host 127.0.0.1 --port 8000
```

LibreOffice가 PATH에 없다면 실행 파일을 지정합니다.

```powershell
$env:LIBREOFFICE_PATH = 'C:\Program Files\LibreOffice\program\soffice.exe'
```

## 배포

> **후속 작업:** 실제 Render 배포와 GitHub Pages 연결은 아직 수행하지 않았습니다. 다음 작업 시 반드시 [PPTX 변환 서비스 배포 체크리스트](docs/deployment-todo.md)를 기준으로 진행하세요.

### Docker/Render 통합 배포

`render.yaml` 또는 `Dockerfile`로 앱과 변환 API를 함께 배포하면 별도 프런트 설정이 필요 없습니다. 상태 확인 주소는 `/api/health`입니다.

### GitHub Pages 프런트 사용

GitHub Pages는 LibreOffice를 실행할 수 없으므로 PPTX 변환 API를 별도 Docker 서버에 배포해야 합니다. `config.js`에서 API 주소를 지정하고, 서버의 `ALLOWED_ORIGINS`에 GitHub Pages 주소를 등록합니다.

```javascript
window.PPTX_CONVERTER_API_URL = 'https://your-api.example.com';
```

```text
ALLOWED_ORIGINS=https://frontierall.github.io
```

PDF 및 이미지 브라우저 기능은 기존 GitHub Pages에서도 계속 동작합니다.

## 환경 변수

| 이름 | 기본값 | 설명 |
| --- | ---: | --- |
| `LIBREOFFICE_PATH` | 자동 탐색 | LibreOffice/soffice 실행 파일 |
| `MAX_PPTX_UPLOAD_BYTES` | `52428800` | PPTX 최대 업로드 크기 |
| `PPTX_CONVERSION_TIMEOUT_SECONDS` | `120` | LibreOffice 변환 제한 시간 |
| `ALLOWED_ORIGINS` | 없음 | 쉼표로 구분한 CORS 허용 출처 |

## 테스트

```powershell
python -m unittest discover -s tests -v
node --check script.js
```

## 기술 구성

- PDF.js, pdf-lib, jsPDF
- Canvas API, pica
- JSZip, FileSaver.js
- FastAPI, Uvicorn
- LibreOffice Impress
- Docker

## 프로젝트 구조

```text
.
├── index.html
├── style.css
├── script.js
├── config.js
├── server.py
├── requirements.txt
├── Dockerfile
├── render.yaml
└── tests/
```

## 버전 기록

### v4.0.0 (2026-08-15)

- PPTX 업로드 및 이미지 변환 추가
- LibreOffice 기반 PPTX → PDF 서버 변환 추가
- Pretendard 포함 Docker 런타임과 Render 배포 설정 추가
- 파일 크기·PPTX 구조·변환 시간 검증 추가
- PPTX 변환 진행 상태와 오류 안내 추가

### v3.1.0 (2026-06-28)

- GitHub Pages 배포 및 방문자 카운터 주소 갱신

## 라이선스

MIT License
