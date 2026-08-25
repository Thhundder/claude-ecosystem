#!/usr/bin/env bash
# Aucune valeur ne doit sortir en clair, sauf CLIENT_ID (public par nature).
# Et la configuration ordinaire doit rester lisible.
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
cat > "$T/a.env" <<'EOF'
API_KEY=abcdef123456
DB_PASS=hunter2
PASS=hunter2
SENHA=hunter2
MOT_DE_PASSE=hunter2
DATABASE_URL=postgres://u:hunter2@h/db
JWT_SECRET=s3cr3t
STRIPE_SK=sk_live_51Hx
GITHUB_PAT=ghp_shortone
SALT=NaCl
OTP_SEED=JBSWY3DP
PIN=4242
SSH_PASSPHRASE=ouvre-toi
ACCESS_CODE=1234
CLIENT_ID=public-ok
EOF
cat > "$T/b.env" <<'EOF'
HOST=localhost
PORT=5432
NODE_ENV=production
DEBUG=true
PUBLIC_URL=https://exemple.fr
EOF
echo "--- doit etre entierement masque, sauf CLIENT_ID ---"
"${SECRET:-$HOME/.claude/bin/lire-secret.sh}" "$T/a.env" | grep -vE '<[0-9]+ car|condensat|^CLIENT_ID=' \
  && echo "^^^ FUITE" || echo "aucune fuite"
echo "--- doit rester lisible ---"
"${SECRET:-$HOME/.claude/bin/lire-secret.sh}" "$T/b.env"
