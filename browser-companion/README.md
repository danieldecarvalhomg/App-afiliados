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

O Safari e o Chrome mobile não aceitam esta extensão de desktop. No celular, abra o Gerador de Links do Mercado Livre, cole a URL do produto e copie o link `meli.la`. No produto do AfiliHub, use **Colar link afiliado do celular**; o backend valida o resultado e atualiza a conversão no Supabase. O AfiliHub também pode ser instalado na tela inicial pelo menu de compartilhamento do Safari ou pelo menu de instalação do Chrome.

## Segurança

- Não solicita permissão `cookies`, `webRequest` ou `<all_urls>`.
- Não lê nem envia senha, CAPTCHA, 2FA, localStorage ou sessionStorage.
- O token próprio do Companion só autentica rotas de heartbeat e jobs do usuário pareado.
- O backend nunca envia JavaScript ou seletores para execução; o adapter é versionado dentro da extensão.
