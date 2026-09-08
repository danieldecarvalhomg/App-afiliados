from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


BASE = Path(__file__).parent
GROUPS = [
    (
        "painel-01-visao-geral-e-criacao.png",
        [
            ("01-dashboard.png", "Dashboard"),
            ("02-produtos.png", "Produtos"),
            ("03-filas.png", "Filas"),
            ("04-treinador-de-ia.png", "Treinador de IA"),
            ("05-templates.png", "Templates"),
            ("06-mensagens.png", "Mensagens"),
        ],
    ),
    (
        "painel-02-automacao-e-conexoes.png",
        [
            ("07-campanhas.png", "Campanhas"),
            ("08-automacoes.png", "Automações"),
            ("09-monitor-de-grupos.png", "Monitor de Grupos"),
            ("10-landing-pages.png", "Landing Pages"),
            ("11-integracoes.png", "Integrações"),
            ("12-contatos.png", "Contatos"),
        ],
    ),
    (
        "painel-03-relatorios-e-conta.png",
        [
            ("13-analytics.png", "Analytics"),
            ("14-biblioteca.png", "Biblioteca"),
            ("15-perfil.png", "Perfil"),
            ("16-assinatura.png", "Assinatura"),
            ("17-ajuda.png", "Ajuda"),
        ],
    ),
]

title_font = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 24)
label_font = ImageFont.truetype(r"C:\Windows\Fonts\arial.ttf", 16)

for output_name, items in GROUPS:
    rows = (len(items) + 1) // 2
    sheet = Image.new("RGB", (1280, 66 + rows * 388 + 26), (10, 10, 10))
    draw = ImageDraw.Draw(sheet)
    draw.text((26, 20), "AfiliHub · Kit de divulgação", font=title_font, fill=(245, 245, 245))
    draw.text(
        (440, 24),
        "Dados 100% fictícios · Atlas Ofertas",
        font=label_font,
        fill=(250, 204, 21),
    )

    for index, (filename, label) in enumerate(items):
        column = index % 2
        row = index // 2
        x = 26 + column * 626
        y = 66 + row * 388
        draw.rounded_rectangle(
            (x, y, x + 600, y + 374),
            radius=14,
            fill=(17, 17, 19),
            outline=(41, 41, 45),
            width=1,
        )
        draw.text((x + 14, y + 10), label, font=label_font, fill=(245, 245, 245))
        screenshot = Image.open(BASE / filename).convert("RGB")
        screenshot.thumbnail((580, 318))
        screenshot_x = x + (600 - screenshot.width) // 2
        screenshot_y = y + 42 + (318 - screenshot.height) // 2
        sheet.paste(screenshot, (screenshot_x, screenshot_y))

    sheet.save(BASE / output_name, quality=94)
