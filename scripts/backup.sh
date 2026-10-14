#!/bin/bash

# ==============================================================================
# WooHub — Backup Script (PostgreSQL)
# ==============================================================================
# Uso: ./scripts/backup.sh [--upload-s3] [--retention-days N]
# Requer: pg_dump, aws cli (opcional para S3)
#
# Formato: custom (-Fc), compatível com o drill de restauração em
# docs/BACKUP_RECOVERY.md (pg_restore). Alerta via ALERT_WEBHOOK_URL em falha.
# ==============================================================================

set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-7}
BACKUP_DIR=${BACKUP_DIR:-"/backups"}
UPLOAD_S3=false
S3_BUCKET=${BACKUP_S3_BUCKET:-""}
S3_PREFIX=${BACKUP_S3_PREFIX:-"woohub/"}

while [[ $# -gt 0 ]]; do
    case $1 in
        --upload-s3) UPLOAD_S3=true; shift ;;
        --retention-days) RETENTION_DAYS="$2"; shift 2 ;;
        --backup-dir) BACKUP_DIR="$2"; shift 2 ;;
        *)
            echo -e "${RED}Opção desconhecida: $1${NC}"
            exit 1
            ;;
    esac
done

# Carregar .env se existir (sem exportar comentários)
if [[ -f .env ]]; then
    set -a
    # shellcheck disable=SC1091
    source <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' .env || true)
    set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
    echo -e "${RED}❌ DATABASE_URL não definido no .env${NC}"
    exit 1
fi

# Alerta de falha para o operador (se configurado)
alert_failure() {
    local msg="$1"
    if [[ -n "${ALERT_WEBHOOK_URL:-}" ]]; then
        curl -sS -m 5 -X POST "$ALERT_WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -d "{\"event\":\"backup.failed\",\"severity\":\"critical\",\"message\":\"$msg\"}" \
            >/dev/null 2>&1 || true
    fi
}

# pg_dump usa a URL diretamente (encoding correto de senha, sem parsing manual)
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's|.*/\([^?]*\).*|\1|p')
DB_NAME=${DB_NAME:-postgres}
BACKUP_FILE="${BACKUP_DIR}/woohub_${DB_NAME}_${TIMESTAMP}.dump"
mkdir -p "$BACKUP_DIR"

echo -e "${BLUE}====================================================${NC}"
echo -e "${BLUE}       WOOHUB DATABASE BACKUP (custom -Fc)  ${NC}"
echo -e "${BLUE}====================================================${NC}"
echo -e "${BLUE}Database:${NC} $DB_NAME"
echo -e "${BLUE}Backup file:${NC} $BACKUP_FILE"
echo -e "${BLUE}Retention:${NC} $RETENTION_DAYS days"
echo -e "${BLUE}====================================================${NC}"

echo -e "\n${BLUE}[1/4] Creating backup (custom format)...${NC}"
if pg_dump --dbname="$DATABASE_URL" \
    --format=custom --no-owner --no-privileges --no-tablespaces \
    --no-sync --file="$BACKUP_FILE"; then
    echo -e "${GREEN}✓ Backup created successfully${NC}"
else
    echo -e "${RED}❌ pg_dump failed${NC}"
    alert_failure "pg_dump failed for database ${DB_NAME}"
    exit 1
fi

# Verificação de integridade básica: arquivo não vazio e pg_restore --list ok
BACKUP_SIZE=$(stat -c%s "$BACKUP_FILE" 2>/dev/null || stat -f%z "$BACKUP_FILE" 2>/dev/null || echo 0)
if [[ "$BACKUP_SIZE" -lt 100 ]]; then
    echo -e "${RED}❌ Backup file suspiciously small (${BACKUP_SIZE} bytes)${NC}"
    alert_failure "Backup file suspiciously small (${BACKUP_SIZE} bytes)"
    exit 1
fi
if command -v pg_restore &> /dev/null; then
    if ! pg_restore --list "$BACKUP_FILE" > /dev/null 2>&1; then
        echo -e "${RED}❌ Backup failed integrity check (pg_restore --list)${NC}"
        alert_failure "Backup failed integrity check"
        exit 1
    fi
    echo -e "${GREEN}✓ Integrity check passed (pg_restore --list)${NC}"
fi

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
            alert_failure "S3 upload failed for ${S3_KEY}"
            exit 1
        fi
    fi
else
    echo -e "\n${BLUE}[3/4] Skipping S3 upload (use --upload-s3 to enable)${NC}"
fi

echo -e "\n${BLUE}[4/4] Cleaning old backups (older than $RETENTION_DAYS days)...${NC}"
find "$BACKUP_DIR" -name "woohub_${DB_NAME}_*.dump*" -type f -mtime +$RETENTION_DAYS -delete
REMAINING=$(find "$BACKUP_DIR" -name "woohub_${DB_NAME}_*.dump*" -type f | wc -l)
echo -e "${GREEN}✓ Cleanup done. $REMAINING backup(s) retained.${NC}"

echo -e "\n${GREEN}====================================================${NC}"
echo -e "${GREEN}       BACKUP CONCLUIDO COM SUCESSO  ${NC}"
echo -e "${GREEN}====================================================${NC}"
echo -e "Arquivo: $BACKUP_FILE"
echo -e "Tamanho: $(du -h "$BACKUP_FILE" | cut -f1)"
echo -e "Restaurar com: pg_restore -d \"\$DATABASE_URL\" --clean --if-exists \"$BACKUP_FILE\""
