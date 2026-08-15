# PPTX 변환 서비스 배포 후속 작업

상태: **미착수 — 반드시 후속 진행**

이 문서는 `agent/pptx-image-conversion` 브랜치에 구현된 PPTX → PDF → 이미지 변환 기능을 실제 서비스에 연결하기 위한 기준 기록입니다.

## 목표

Render 등의 Docker 호스팅에 FastAPI/LibreOffice 변환 서버를 배포하고, GitHub Pages 프런트엔드에서 해당 API를 호출해 실제 PPTX 파일을 이미지로 다운로드할 수 있게 합니다.

## 작업 체크리스트

- [ ] `agent/pptx-image-conversion` 브랜치를 검토하고 기본 브랜치에 병합
- [ ] Render에서 이 저장소의 `render.yaml`을 이용해 Web Service 생성
- [ ] Docker 이미지 빌드가 성공하고 LibreOffice 및 Pretendard가 설치되는지 확인
- [ ] Render의 `/api/health`가 HTTP 200과 `{"ok": true}`를 반환하는지 확인
- [ ] Render 환경 변수 `ALLOWED_ORIGINS=https://frontierall.github.io` 설정
- [ ] Render 서비스의 공개 HTTPS 주소 확정
- [ ] `config.js`의 `PPTX_CONVERTER_API_URL`을 공개 API 주소로 변경
- [ ] 변경된 프런트엔드를 GitHub Pages에 배포
- [ ] 작은 PPTX와 50MB에 가까운 PPTX로 업로드 테스트
- [ ] JPG·PNG, 페이지 범위, 개별 다운로드, ZIP 다운로드 확인
- [ ] Pretendard Regular/Bold/다중 굵기와 한글 줄바꿈을 원본 슬라이드와 비교
- [ ] 잘못된 확장자, 손상된 PPTX, 50MB 초과, 변환 시간 초과 오류 문구 확인
- [ ] Render 콜드 스타트와 무료 플랜 제한을 측정하고 필요하면 유료 플랜 결정
- [ ] 운영 로그에 원본 파일명이나 문서 내용이 불필요하게 남지 않는지 확인

## 배포 환경 변수

| 이름 | 권장값 | 목적 |
| --- | --- | --- |
| `ALLOWED_ORIGINS` | `https://frontierall.github.io` | GitHub Pages의 API 호출 허용 |
| `MAX_PPTX_UPLOAD_BYTES` | `52428800` | 최대 업로드 크기 50MB |
| `PPTX_CONVERSION_TIMEOUT_SECONDS` | `120` | LibreOffice 변환 제한 시간 |

Docker 이미지에서는 `LIBREOFFICE_PATH`를 별도로 지정하지 않아도 자동 탐색합니다.

## 완료 조건

다음 조건을 모두 만족해야 이 후속 작업을 완료로 처리합니다.

1. 공개 GitHub Pages에서 PPTX 업로드가 성공한다.
2. Pretendard 한글 슬라이드가 원본과 유사한 레이아웃의 이미지로 변환된다.
3. JPG/PNG 및 ZIP 다운로드가 정상 동작한다.
4. 업로드 원본과 중간 PDF가 요청 종료 후 서버에 남지 않는다.
5. 오류 상황이 사용자에게 한국어로 명확히 표시된다.
6. README의 실제 운영 URL과 배포 절차가 최종 상태로 갱신된다.

## 현재 검증된 범위

- FastAPI 단위/API 테스트 6개 통과
- Windows LibreOffice를 이용한 실제 2슬라이드 PPTX → 2페이지 PDF 변환 성공
- Pretendard 한글 텍스트 보존 확인
- Dockerfile과 Render Blueprint는 작성했으나 실제 클라우드 배포는 아직 수행하지 않음
