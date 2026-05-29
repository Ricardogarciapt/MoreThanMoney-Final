# Remote Desktop (Guacamole) - VPS Ubuntu

Este setup permite abrir o desktop remoto no browser e ligar via a página `/admin/desktop-remoto`.

## 1) Subir Guacamole

```bash
sudo mkdir -p /opt/mtm-remote-desktop
sudo chown -R "$USER:$USER" /opt/mtm-remote-desktop
cp deploy/vps-remote-desktop/docker-compose.guacamole.yml /opt/mtm-remote-desktop/docker-compose.yml
cd /opt/mtm-remote-desktop
docker compose up -d
docker ps
```

Abrir `http://IP_DO_VPS:8088/guacamole` e login inicial:

- user: `guacadmin`
- password: `guacadmin`

Muda password no primeiro login.

## 2) Instalar interface gráfica + xrdp no Ubuntu

```bash
sudo apt update
sudo apt install -y xfce4 xfce4-goodies xrdp
echo xfce4-session > ~/.xsession
sudo systemctl enable xrdp
sudo systemctl restart xrdp
sudo systemctl status xrdp --no-pager -l
```

No Security Group da EC2, abre `3389/tcp` **somente** para localhost/VPC se possível.

## 3) Criar utilizador dedicado para desktop remoto

```bash
sudo adduser mtmadmin
sudo usermod -aG sudo,docker mtmadmin
```

## 4) Configurar conexão no Guacamole

No painel do Guacamole:

- New Connection
- Protocol: `RDP`
- Hostname: `127.0.0.1`
- Port: `3389`
- Username: `mtmadmin`
- Password: `<a password you set>`
- Security mode: `any`

## 5) Publicar em HTTPS (opcional, recomendado)

No Nginx da VPS:

```nginx
location /guacamole/ {
  proxy_pass http://127.0.0.1:8088/guacamole/;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

## 6) Ligar no site MTM

Definir no Vercel:

`NEXT_PUBLIC_REMOTE_DESKTOP_URL=https://stream.morethanmoney.pt/guacamole/`

Depois abre:

`/admin/desktop-remoto`

