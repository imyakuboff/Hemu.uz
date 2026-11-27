#!/bin/bash
# Tashqi tekshiruv: hujumchi ko'radigan narsalar (faqat o'qish, hech narsa o'zgartirilmaydi)
H=hemu.uz; IP=189.74.98.45; U=https://$H
n() { echo "::notice::$*"; }
n "Portlar (TCP, top 1000 + maxsus): $(sudo nmap -Pn -sS --top-ports 1000 -p T:1-1024,3000-3100,4000-4800,5000-5432,6379,8000-8100,8790,9000-9200,27017 --open -T4 $IP 2>/dev/null | grep -E '^[0-9]+/tcp' | awk '{print $1"="$3}' | tr '\n' ' ')"
n "Xizmat versiyalari: $(sudo nmap -Pn -sV -p 22,80,443 --version-light $IP 2>/dev/null | grep -E '^[0-9]+/tcp' | awk '{$2="";print}' | tr -s ' ' | tr '\n' ';')"
for p in 3100 4100 4710 4700 8000 8790; do c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 6 http://$IP:$p/); [ "$c" != "000" ] && n "TO'G'RIDAN-TO'G'RI OCHIQ: http://IP:$p -> $c (nginx'ni chetlab o'tadi)"; done
n "IP orqali kirish: http=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 8 http://$IP/) https=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 8 https://$IP/) sertifikat=$(echo | openssl s_client -connect $IP:443 2>/dev/null | openssl x509 -noout -subject 2>/dev/null | sed 's/.*CN *= *//')"
for v in tls1 tls1_1 tls1_2 tls1_3; do r=$(echo | timeout 8 openssl s_client -connect $H:443 -servername $H -$v 2>/dev/null | grep -c 'Cipher is [A-Z]'); printf '%s=%s ' $v $r; done > /tmp/tls; n "TLS: $(cat /tmp/tls)| sertifikat: $(echo | openssl s_client -connect $H:443 -servername $H 2>/dev/null | openssl x509 -noout -enddate -issuer 2>/dev/null | tr '\n' ' ')"
HD=$(curl -sI --max-time 10 $U/)
n "Sarlavhalar: server=[$(echo "$HD" | grep -i '^server:' | tr -d '\r' | cut -d' ' -f2-)] x-powered-by=[$(echo "$HD" | grep -i '^x-powered-by' | tr -d '\r')] HSTS=[$(echo "$HD" | grep -i strict-transport | tr -d '\r' | cut -d' ' -f2-)] CSP=$(echo "$HD" | grep -ci content-security-policy) XFO=[$(echo "$HD" | grep -i x-frame | tr -d '\r' | cut -d' ' -f2-)] nosniff=$(echo "$HD" | grep -ci nosniff) referrer=$(echo "$HD" | grep -ci referrer-policy) permissions=$(echo "$HD" | grep -ci permissions-policy)"
n "CSP: $(echo "$HD" | grep -i content-security-policy | tr -d '\r' | cut -c1-600)"
R=""; for p in /.env /.git/HEAD /.git/config /package.json /data/movexgo.db /data/ /uploads/ /uploads/docs/ /src/config.js /seed.js /node_modules/ /backup.tgz /.github/workflows/deploy.yml /server-status /phpmyadmin/ /wp-login.php /api/v1/admin/overview /api/v1/admin/users /api/v1/admin/settings /api/v1/me /api/v1/notifications /api/v1/crm /api/v1/orders /api/v1/wallet /api/v1/backup /metrics /api/v1/debug /sw.js; do c=$(curl -s -o /tmp/b -w '%{http_code}' --max-time 8 "$U$p"); s=$(wc -c < /tmp/b); R="$R $p=$c/${s}b"; done; n "Yo'llar:$R"
n "/.env tarkibi APP_SECRET bormi: $(curl -s --max-time 8 $U/.env | grep -c APP_SECRET) | /package.json name: $(curl -s --max-time 8 $U/package.json | grep -o '\"name\"[^,]*' | head -1)"
n "CORS (begona sayt): $(curl -sI --max-time 8 -H 'Origin: https://evil.example' $U/api/v1/me | grep -i 'access-control-allow' | tr -d '\r' | tr '\n' ' ') | TRACE: $(curl -s -o /dev/null -w '%{http_code}' -X TRACE --max-time 8 $U/) | OPTIONS api: $(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS --max-time 8 $U/api/v1/listings)"
# Login brute-force himoyasi: 12 ta noto'g'ri urinish (mavjud bo'lmagan login)
C=""; for i in $(seq 1 12); do C="$C$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 -X POST -H 'content-type: application/json' -d '{"login":"no_such_user_zz","password":"wrong-pass-123"}' $U/api/v1/auth/login),"; done; n "Login 12 urinish: $C"
# Umumiy API tezlik cheklovi: 60 ta tez so'rov
C=$(for i in $(seq 1 60); do curl -s -o /dev/null -w '%{http_code}\n' --max-time 8 "$U/api/v1/listings?per_page=1" & done; wait); n "API 60 parallel so'rov: $(echo "$C" | sort | uniq -c | tr -s ' ' | tr '\n' ' ')"
n "Xato ma'lumot oqishi: $(curl -s --max-time 8 "$U/api/v1/listings?sort='%22;--&per_page=abc&page=-1" | head -c 200) || $(curl -s --max-time 8 -X POST -H 'content-type: application/json' -d '{bad json' $U/api/v1/auth/login | head -c 200)"
n "Health ma'lumoti: $(curl -s --max-time 8 $U/api/v1/health | head -c 300)"
n "Katta so'rov (20MB JSON): $(head -c 20000000 /dev/zero | tr '\0' 'a' | curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X POST -H 'content-type: application/json' --data-binary @- $U/api/v1/auth/login)"
n "Cookie: $(curl -sI --max-time 8 $U/ | grep -i set-cookie | tr -d '\r' | cut -c1-200)"
n "Boshqa domenlar shu IP'da: www=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 https://www.$H/) movexgo.uz=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 https://movexgo.uz/)"
n "DNS: CAA=$(dig +short CAA $H | tr '\n' ' ') SPF=$(dig +short TXT $H | grep -c spf) DMARC=$(dig +short TXT _dmarc.$H | grep -c DMARC) MX=$(dig +short MX $H | tr '\n' ' ') DNSSEC=$(dig +short DS $H | wc -l)"
