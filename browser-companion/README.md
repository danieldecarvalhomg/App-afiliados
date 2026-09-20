# AfiliHub Browser Companion

Extensão Chrome/Chromium Manifest V3 para gerar links afiliados do Mercado Livre usando a sessão já autenticada no navegador do usuário.

## Instalação local

1. Abra `chrome://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione esta pasta `browser-companion`.
5. No AfiliHub, abra **Integrações → Mercado Livre → Conectar extensão** e gere um código.
6. Abra a extensão, informe o código e conclua o login normal no Mercado Livre.

## Atualização

Depois de substituir os arquivos da pasta, abra `chrome://extensions` e clique no ícone de recarregar do **AfiliHub Browser Companion**. A extensão mantém o pareamento existente; não é necessário gerar outro código.

## iPhone e Android

O Safari e o Chrome mobile não aceitam esta extensão de desktop. A extensão é necessária somente para a sincronização inicial da sessão: depois disso, o motor próprio converte no backend e o AfiliHub pode gerar links pelo iPhone ou Android mesmo com o computador desligado. Quando a sessão expirar, abra novamente o Chrome conectado para renová-la.

## Segurança

- Solicita `cookies` somente nos hosts explícitos do Mercado Livre e envia apenas os cookies aplicáveis ao endpoint de afiliados para o backend autorizado.
- A sessão é cifrada com AES-256-GCM antes de ser persistida e nunca é devolvida ao frontend.
- Não lê nem envia senha, CAPTCHA, 2FA, localStorage ou sessionStorage.
- O token próprio do Companion só autentica rotas de heartbeat e jobs do usuário pareado.
- O backend nunca envia JavaScript ou seletores para execução; o adapter é versionado dentro da extensão.
