#!/usr/bin/env bash
# Instala o Draft 100 como serviço numa máquina Linux (Ubuntu/Debian/Oracle Linux), ligado 24 h.
# Uso, dentro da máquina:
#   git clone https://github.com/SEU-USUARIO/draft100.git && cd draft100
#   sudo bash deploy/instalar-servidor-linux.sh
# Para atualizar depois: cd draft100 && git pull && sudo bash deploy/instalar-servidor-linux.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR=/var/lib/draft100
PORT="${PORT:-3000}"

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  echo "▸ Instalando Node.js 22"
  if command -v apt-get >/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  else
    curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
    (dnf install -y nodejs || yum install -y nodejs)
  fi
fi

echo "▸ Instalando dependências"
cd "$APP_DIR"
npm ci --omit=dev

id draft100 >/dev/null 2>&1 || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin draft100
mkdir -p "$DATA_DIR"
chown -R draft100:draft100 "$DATA_DIR"

echo "▸ Criando o serviço (liga sozinho quando a máquina reinicia)"
cat > /etc/systemd/system/draft100.service <<EOF
[Unit]
Description=Draft 100 - Leilao NBA
After=network-online.target

[Service]
User=draft100
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production PORT=$PORT DATA_DIR=$DATA_DIR
ExecStart=$(command -v node) server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now draft100
systemctl restart draft100

# libera a porta no firewall da própria máquina (no Oracle Cloud também precisa liberar na "Security List")
if command -v ufw >/dev/null && ufw status | grep -q active; then ufw allow "$PORT"/tcp; fi
if command -v firewall-cmd >/dev/null; then firewall-cmd --permanent --add-port="$PORT"/tcp && firewall-cmd --reload; fi
if command -v iptables >/dev/null && iptables -L INPUT -n | grep -q "REJECT"; then
  iptables -I INPUT 6 -p tcp --dport "$PORT" -j ACCEPT
  command -v netfilter-persistent >/dev/null && netfilter-persistent save || true
fi

sleep 2
if curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null; then
  echo
  echo "✓ Draft 100 rodando: http://$(curl -fsS https://api.ipify.org 2>/dev/null || echo IP-DA-MAQUINA):$PORT"
  echo "  Histórico em $DATA_DIR/historico.json  ·  logs: journalctl -u draft100 -f"
else
  echo "✗ O serviço não respondeu. Veja: journalctl -u draft100 -n 50"; exit 1
fi
