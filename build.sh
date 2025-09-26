#!/bin/bash

# Script para construir y hacer push de la imagen Docker

# Configuración por defecto
REGISTRY_URL=${REGISTRY_URL:-"cr.sintesis.com.bo/crossborder-dev"}
IMAGE_NAME=${IMAGE_NAME:-"cb-testclient"}
IMAGE_TAG=${IMAGE_TAG:-"latest"}
DOCKERFILE_PATH=${DOCKERFILE_PATH:-"./Dockerfile"}

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Función para logging
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}" >&2
}

warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

# Función para mostrar ayuda
show_help() {
    cat << EOF
Uso: $0 [OPTIONS]

Script para construir y hacer push de imagen Docker

OPTIONS:
    -r, --registry      URL del registry (ej: my-registry.com)
    -n, --name          Nombre de la imagen (default: cb-testclient)
    -t, --tag           Tag de la imagen (default: latest)
    -f, --file          Ruta al Dockerfile (default: ./Dockerfile)
    -p, --push-only     Solo hacer push, no construir
    -h, --help          Mostrar esta ayuda

Variables de entorno:
    REGISTRY_URL        URL del registry
    IMAGE_NAME          Nombre de la imagen
    IMAGE_TAG           Tag de la imagen
    DOCKERFILE_PATH     Ruta al Dockerfile

Ejemplos:
    $0 -r my-registry.com -n cb-testclient -t v1.0.0
    $0 --registry my-registry.com --name cb-testclient --tag latest
    REGISTRY_URL=my-registry.com $0
EOF
}

# Parsear argumentos
PUSH_ONLY=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -r|--registry)
            REGISTRY_URL="$2"
            shift 2
            ;;
        -n|--name)
            IMAGE_NAME="$2"
            shift 2
            ;;
        -t|--tag)
            IMAGE_TAG="$2"
            shift 2
            ;;
        -f|--file)
            DOCKERFILE_PATH="$2"
            shift 2
            ;;
        -p|--push-only)
            PUSH_ONLY=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            error "Opción desconocida: $1"
            show_help
            exit 1
            ;;
    esac
done

# Construir nombre completo de la imagen
if [[ -n "$REGISTRY_URL" ]]; then
    FULL_IMAGE_NAME="${REGISTRY_URL}/${IMAGE_NAME}:${IMAGE_TAG}"
else
    FULL_IMAGE_NAME="${IMAGE_NAME}:${IMAGE_TAG}"
fi

log "Configuración:"
log "  Registry: ${REGISTRY_URL:-"(local)"}"
log "  Imagen: ${IMAGE_NAME}"
log "  Tag: ${IMAGE_TAG}"
log "  Nombre completo: ${FULL_IMAGE_NAME}"
log "  Dockerfile: ${DOCKERFILE_PATH}"

# Verificar que Docker esté disponible
if ! command -v docker &> /dev/null; then
    error "Docker no está instalado o no está en el PATH"
    exit 1
fi

# Verificar que el Dockerfile existe
if [[ ! -f "$DOCKERFILE_PATH" ]]; then
    error "Dockerfile no encontrado: $DOCKERFILE_PATH"
    exit 1
fi

# Construir la imagen si no es push-only
if [[ "$PUSH_ONLY" = false ]]; then
    log "Construyendo imagen Docker..."
    
    if docker build -t "$FULL_IMAGE_NAME" -f "$DOCKERFILE_PATH" .; then
        log "✅ Imagen construida exitosamente: $FULL_IMAGE_NAME"
    else
        error "❌ Error al construir la imagen"
        exit 1
    fi
    
    # También crear tag local sin registry si se especificó registry
    if [[ -n "$REGISTRY_URL" ]]; then
        LOCAL_TAG="${IMAGE_NAME}:${IMAGE_TAG}"
        docker tag "$FULL_IMAGE_NAME" "$LOCAL_TAG"
        log "✅ Tag local creado: $LOCAL_TAG"
    fi
else
    log "Modo push-only activado, saltando construcción"
fi

# Push al registry si se especificó
if [[ -n "$REGISTRY_URL" ]]; then
    log "Haciendo push al registry..."
    
    # Verificar si estamos logueados al registry
    if docker info &> /dev/null; then
        log "Docker está corriendo correctamente"
    else
        error "Error de conexión con Docker daemon"
        exit 1
    fi
    
    if docker push "$FULL_IMAGE_NAME"; then
        log "✅ Push exitoso: $FULL_IMAGE_NAME"
    else
        error "❌ Error al hacer push al registry"
        warning "Asegúrate de estar logueado al registry con: docker login $REGISTRY_URL"
        exit 1
    fi
else
    warning "No se especificó registry, la imagen solo está disponible localmente"
fi

log "🎉 Proceso completado exitosamente!"
log "Imagen disponible: $FULL_IMAGE_NAME"

# Mostrar información de la imagen
log "Información de la imagen:"
docker images "$FULL_IMAGE_NAME" --format "table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.CreatedAt}}\t{{.Size}}"
