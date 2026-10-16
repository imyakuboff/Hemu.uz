#!/bin/sh
# HEMU.UZ serverini himoyalash: fail2ban, SSH cheklovlari, firewall, tarmoq yadrosi sozlamalari.
# Ishga tushirish (root): sh /opt/hemu/deploy/harden.sh <o'z IP manzilingiz (bloklanmasin)>
set -e
MYIP="$1"

# 1) fail2ban — parol terish va skanerlash hujumlarini bloklaydi
DEBIAN_FRONTEND=noninteractive apt-get install -y fail2ban >/dev/null
cat > /etc/fail2ban/jail.d/hemu.local <<EOF
[DEFAULT]
# 10 daqiqada 5 marta xato — 1 soatga blok; takrorlansa muddat oshib boradi (1 haftagacha)
bantime = 1h
bantime.increment = true
bantime.maxtime = 1w
findtime = 10m
maxretry = 5
banaction = ufw
ignoreip = 127.0.0.1/8 ::1 ${MYIP}

[sshd]
enabled = true
mode = aggressive
logpath = /var/log/auth.log
maxretry = 4

# Saytda yo'q fayllarni (wp-login, .env, phpmyadmin...) qidirayotgan skanerlar
[nginx-botsearch]
enabled = true
logpath = /var/log/nginx/access.log

# So'rovlar chegarasidan (limit_req) qayta-qayta oshayotganlar
[nginx-limit-req]
enabled = true
logpath = /var/log/nginx/error.log
maxretry = 10

# Bizning nginx skanerlarga 444 qaytaradi — 3 marta bo'lsa blok
[hemu-scan]
enabled = true
filter = hemu-scan
logpath = /var/log/nginx/access.log
maxretry = 3
bantime = 1d

# Bir necha marta bloklanganlar — 1 haftaga
[recidive]
enabled = true
bantime = 1w
findtime = 1d
EOF
cat > /etc/fail2ban/filter.d/hemu-scan.conf <<'EOF'
[Definition]
failregex = ^<HOST> \S+ \S+ \[[^\]]*\] "[A-Z]+ [^"]*" 444
ignoreregex =
EOF
systemctl enable fail2ban >/dev/null 2>&1
systemctl restart fail2ban

# 2) SSH: urinishlar soni va kutish vaqtini kamaytirish (parol bilan kirish hozircha saqlanadi)
cat > /etc/ssh/sshd_config.d/99-hemu-hardening.conf <<EOF
MaxAuthTries 3
LoginGraceTime 30
X11Forwarding no
AllowAgentForwarding no
ClientAliveInterval 300
ClientAliveCountMax 2
EOF
sshd -t && systemctl reload ssh

# 3) Firewall: SSH ga 30 soniyada 6 tadan ortiq yangi ulanish — rad etiladi
ufw limit OpenSSH >/dev/null

# 4) Tarmoq yadrosi: SYN-flood, soxta manzillar, yo'naltirishlar
cat > /etc/sysctl.d/99-hemu-hardening.conf <<EOF
net.ipv4.tcp_syncookies = 1
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.conf.all.log_martians = 1
EOF
sysctl --system >/dev/null

echo "harden: ok"
