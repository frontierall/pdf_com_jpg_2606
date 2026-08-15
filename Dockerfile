FROM python:3.12-slim

ARG PRETENDARD_VERSION=1.3.9

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl \
        fonts-noto-cjk \
        libreoffice-impress \
        unzip \
    && curl -fsSL \
        "https://github.com/orioncactus/pretendard/releases/download/v${PRETENDARD_VERSION}/Pretendard-${PRETENDARD_VERSION}.zip" \
        -o /tmp/pretendard.zip \
    && unzip -j /tmp/pretendard.zip "public/static/alternative/*.ttf" -d /usr/local/share/fonts/pretendard \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/* /tmp/pretendard.zip

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=8000 \
    MAX_PPTX_UPLOAD_BYTES=52428800 \
    PPTX_CONVERSION_TIMEOUT_SECONDS=120

EXPOSE 8000

CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT}"]
