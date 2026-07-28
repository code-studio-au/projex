#!/usr/bin/env bash
set -euo pipefail

NGINX_CONF_PATH="${NGINX_CONF_PATH:-/etc/nginx/conf.d/projex.conf}"
NGINX_TLS_TEMPLATE_PATH="${NGINX_TLS_TEMPLATE_PATH:-/etc/projex/projex.nginx.https.conf.template}"
WEBROOT_PATH="${WEBROOT_PATH:-/var/www/certbot}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    fail "Missing required command: $command_name"
  fi
}

require_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    fail "Missing required file: $path"
  fi
}

validate_domain() {
  local domain="$1"
  if (( ${#domain} > 253 )) ||
    [[ ! "$domain" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then
    fail "Invalid DNS domain: $domain"
  fi
}

ensure_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    fail 'Run this script as root.'
  fi
}

install_certbot_if_missing() {
  if command -v certbot >/dev/null 2>&1; then
    return
  fi

  log 'Installing certbot'
  dnf install -y certbot || yum install -y certbot
}

render_tls_config() {
  local primary_domain="$1"
  local server_names="$2"
  local http2_listen_suffix=" http2"
  local http2_directive=""
  local nginx_version

  nginx_version="$(nginx -v 2>&1 || true)"
  if [[ "$nginx_version" =~ nginx/([0-9]+)\.([0-9]+)\.([0-9]+) ]] &&
    (( BASH_REMATCH[1] > 1 ||
      (BASH_REMATCH[1] == 1 &&
        (BASH_REMATCH[2] > 25 ||
          (BASH_REMATCH[2] == 25 && BASH_REMATCH[3] >= 1))) )); then
    http2_listen_suffix=""
    http2_directive="  http2 on;"
  fi

  sed \
    -e "s/__PRIMARY_DOMAIN__/${primary_domain}/g" \
    -e "s/__SERVER_NAMES__/${server_names}/g" \
    -e "s/__HTTP2_LISTEN_SUFFIX__/${http2_listen_suffix}/g" \
    -e "s/__HTTP2_DIRECTIVE__/${http2_directive}/g" \
    "$NGINX_TLS_TEMPLATE_PATH" > "$NGINX_CONF_PATH"
}

install_renew_hook() {
  install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
  cat <<'EOF' > /etc/letsencrypt/renewal-hooks/deploy/projex-nginx-reload.sh
#!/usr/bin/env bash
set -euo pipefail
nginx -t
systemctl reload nginx
EOF
  chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/projex-nginx-reload.sh
}

render_only() {
  if [[ "$#" -lt 1 ]]; then
    fail 'Usage: provision-letsencrypt-cert.sh --render-tls-config <primary-domain> [alternate-domain ...]'
  fi
  local domains=("$@")
  local domain
  for domain in "${domains[@]}"; do
    validate_domain "$domain"
  done
  render_tls_config "${domains[0]}" "${domains[*]}"
}

main() {
  ensure_root

  if [[ "$#" -lt 1 ]]; then
    fail 'Usage: LETSENCRYPT_EMAIL=ops@example.com provision-letsencrypt-cert.sh <primary-domain> [alternate-domain ...]'
  fi

  local primary_domain="$1"
  shift
  local domains=("$primary_domain" "$@")
  local domain
  for domain in "${domains[@]}"; do
    validate_domain "$domain"
  done

  if [[ -z "$LETSENCRYPT_EMAIL" ]]; then
    fail 'LETSENCRYPT_EMAIL must be set.'
  fi

  require_command nginx
  require_file "$NGINX_TLS_TEMPLATE_PATH"
  install_certbot_if_missing

  install -d -m 0755 "${WEBROOT_PATH}/.well-known/acme-challenge"

  log 'Validating current nginx configuration'
  nginx -t
  systemctl reload nginx

  local certbot_args=(
    certonly
    --non-interactive
    --agree-tos
    --email "$LETSENCRYPT_EMAIL"
    --webroot
    --webroot-path "$WEBROOT_PATH"
    --keep-until-expiring
  )

  for domain in "${domains[@]}"; do
    certbot_args+=(-d "$domain")
  done

  log "Requesting Let's Encrypt certificate for ${domains[*]}"
  certbot "${certbot_args[@]}"

  render_tls_config "$primary_domain" "${domains[*]}"
  install_renew_hook

  log 'Validating nginx TLS configuration'
  nginx -t
  systemctl reload nginx

  log "Let's Encrypt certificate installed for ${domains[*]}"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  if [[ "${1:-}" == "--render-tls-config" ]]; then
    shift
    render_only "$@"
  else
    main "$@"
  fi
fi
