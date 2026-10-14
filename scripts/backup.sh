#!/bin/bash

# ==============================================================================
# 🗄️ WooHub — Backup Script (PostgreSQL)
# ==============================================================================
# Uso: ./scripts/backup.sh [--upload-s3] [--retention-days N]
# Requer: pg_dump, aws cli (opcional para S3), jq
# ==============================================================================

set -euo pipefail

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configurações padrão
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-7}
BACKUP_DIR=${BACKUP_DIR:-"/backups"}
UPLOAD_S3=false
S3_BUCKET=${BACKUP_S3_BUCKET:-""}
S3_PREFIX=${BACKUP_S3_PREFIX:-"woohub/"}
COMPRESS=true

# Parse args
while [[ $# -gt 0 ]]; do
    case $1 in
        --upload-s3)
            UPLOAD_S3=true
            shift
            ;;
        --retention-days)
            RETENTION_DAYS="$2"
            shift 2
            ;;
        --backup-dir)
            BACKUP_DIR="$2"
            shift 2
            ;;
        --no-compress)
            COMPRESS=false
            shift
            ;;
        *)
            echo -e "${RED}Opção desconhecida: $1${NC}"
            exit 1
            ;;
    esac
done

# Carregar .env se existir
if [[ -f .env ]]; then
    export $(grep -v '^#' .env | xargs)
fi

# Validar DATABASE_URL
if [[ -z "${DATABASE_URL:-}" ]]; then
    echo -e "${RED}❌ DATABASE_URL não definido no .env${NC}"
    exit 1
fi

# Extrair parâmetros de conexão do DATABASE_URL
# formato: postgresql://user:pass@host:port/dbname?schema=public
DB_URL="${DATABASE_URL}"
DB_USER=$(echo "$DB_URL" | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
DB_PASS=$(echo "$DB_URL" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
DB_HOST=$(echo "$DB_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo "$DB_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo "$DB_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')

# Fallback para variáveis individuais
DB_USER=${DB_USER:-${POSTGRES_USER:-postgres}}
DB_PASS=${DB_PASS:-${POSTGRES_PASSWORD:-}}
DB_HOST=${DB_HOST:-${POSTGRES_HOST:-localhost}}
DB_PORT=${DB_PORT:-${POSTGRES_PORT:-5432}}
DB_NAME=${DB_NAME:-${POSTGRES_DB:-woohub}}

export PGPASSWORD="$DB_PASS"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/woohub_${DB_NAME}_${TIMESTAMP}.sql"
mkdir -p "$BACKUP_DIR"

echo -e "${BLUE}====================================================${NC}"
echo -e "${BLUE}       🗄️  WOOHUB DATABASE BACKUP  ${NC}"
echo -e "${BLUE}====================================================${NC}"
echo -e "${BLUE}Database:${NC} $DB_NAME @ $DB_HOST:$DB_PORT"
echo -e "${BLUE}Backup file:${NC} $BACKUP_FILE"
echo -e "${BLUE}Retention:${NC} $RETENTION_DAYS days"
echo -e "${BLUE}====================================================${NC}"

# Executar pg_dump
echo -e "\n${BLUE}[1/4] Creating backup...${NC}"
if pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --no-owner --no-privileges --no-tablespaces \
    --format=plain --no-sync > "$BACKUP_FILE"; then
    echo -e "${GREEN}✓ Backup created successfully${NC}"
else
    echo -e "${RED}❌ pg_dump failed${NC}"
    exit 1
fi

# Comprimir
if [[ "$COMPRESS" == "true" ]]; then
    echo -e "\n${BLUE}[2/4] Compressing backup...${NC}"
    if gzip "$BACKUP_FILE"; then
        BACKUP_FILE="${BACKUP_FILE}.gz"
        echo -e "${GREEN}✓ Backup compressed: $(du -h "$BACKUP_FILE" | cut -f1)${NC}"
    else
        echo -e "${RED}❌ Compression failed${NC}"
        exit 1
    fi
fi

# Upload para S3 (opcional)
if [[ "$UPLOAD_S3" == "true" ]]; then
    if [[ -z "$S3_BUCKET" ]]; then
        echo -e "${YELLOW}⚠️ BACKUP_S3_BUCKET não definido, pulando upload${NC}"
    elif ! command -v aws &> /dev/null; then
        echo -e "${YELLOW}⚠️ AWS CLI não instalado, pulando upload${NC}"
    else
        echo -e "\n${BLUE}[3/4] Uploading to S3...${NC}"
        S3_KEY="${S3_PREFIX}$(basename "$BACKUP_FILE")"
        if aws s3 cp "$BACKUP_FILE" "s3://${S3_BUCKET}/${S3_KEY}"; then
            echo -e "${GREEN}✓ Uploaded to s3://${S3_BUCKET}/${S3_KEY}${NC}"
        else
            echo -e "${RED}❌ S3 upload failed${NC}"
            exit 1
        fi
    fi
else
    echo -e "\n${BLUE}[3/4] Skipping S3 upload (use --upload-s3 to enable)${NC}"
fi

# Limpeza de backups antigos
echo -e "\n${BLUE}[4/4] Cleaning old backups (older than $RETENTION_DAYS days)...${NC}"
find "$BACKUP_DIR" -name "woohub_${DB_NAME}_*.sql*" -type f -mtime +$RETENTION_DAYS -delete
REMAINING=$(find "$BACKUP_DIR" -name "woohub_${DB_NAME}_*.sql*" -type f | wc -l)
echo -e "${GREEN}✓ Cleanup done. $REMAINING backup(s) retained.${NC}"

echo -e "\n${GREEN}====================================================${NC}"
echo -e "${GREEN}       ✅ BACKUP CONCLUÍDO COM SUCESSO  ${NC}"
echo -e "${GREEN}====================================================${NC}"
echo -e "Arquivo: $BACKUP_FILE"
echo -e "Tamanho: $(du -h "$BACKUP_FILE" | cut -f1)"