#!/usr/bin/env python3
"""Gera os ícones RASTER do app a partir do símbolo da marca.

Sai daqui:
  apps/web/public/favicon.ico        16..256, para o navegador
  apps/web/public/apple-touch-icon.png  180x180, para a tela de início do iOS

Por que o .ico: precisa ser QUADRADO e multi-tamanho, e o símbolo é alto e fino
(62x116). Exportá-lo direto vira ícone espremido — foi o que aconteceu com o
prumolicita-simbolo.ico original (21x32, uma imagem só).

Por que o PNG: o Safari NÃO aceita SVG em apple-touch-icon. Apontar o link para
o .svg (como já esteve) faz o iOS ignorar e usar um print da página.

Por que desenha em vez de rasterizar o SVG: não há cairosvg/rsvg nesta máquina, e
o símbolo é só linha + círculo + dois polígonos. Desenhar é mais barato que somar
dependência.

As coordenadas e cores são as MESMAS de prumolicita-simbolo.svg e de
public/icon.svg. Mudou o símbolo? Rode de novo:  python3 brand/gerar-favicon.py

Requer Pillow.
"""

from PIL import Image, ImageDraw

GRAFITE = (0x21, 0x1F, 0x1C, 255)
CONCRETO = (0xEC, 0xE7, 0xDF, 255)
AMBAR = (0xC2, 0x5A, 0x26, 255)
AMBAR_ESCURO = (0xA8, 0x48, 0x1C, 255)

# Espaço de 512 (o mesmo do icon.svg), desenhado em 4x para o downsample suavizar.
LADO = 512
SUPER = 4
TAMANHOS = [16, 32, 48, 64, 128, 256]

# Mesmo transform do icon.svg: translate(142.9, 87.8) scale(2.9). Mantém o
# símbolo dentro da área segura do maskable.
TX, TY, S = 142.9, 87.8, 2.9


def p(x: float, y: float) -> tuple[float, float]:
    """Ponto do símbolo (viewBox 78x116) → espaço do ícone, já em superamostragem."""
    return ((TX + x * S) * SUPER, (TY + y * S) * SUPER)


def desenhar() -> Image.Image:
    lado = LADO * SUPER
    img = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Fundo grafite. O raio (112/512) acompanha o icon.svg.
    d.rounded_rectangle([0, 0, lado - 1, lado - 1], radius=112 * SUPER, fill=GRAFITE)

    # Linha do prumo (sob a bolinha), stroke-width 4 no espaço do símbolo.
    d.line([p(39, 0), p(39, 40)], fill=CONCRETO, width=round(4 * S * SUPER))

    # Bolinha de fixação: cx=39 cy=6 r=6.
    cx, cy = p(39, 6)
    r = 6 * S * SUPER
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=CONCRETO)

    # Bob: a pipa inteira (tom claro) e o losango de cima por cima (tom escuro).
    d.polygon([p(39, 40), p(70, 70), p(39, 116), p(8, 70)], fill=AMBAR)
    d.polygon([p(39, 40), p(70, 70), p(39, 84), p(8, 70)], fill=AMBAR_ESCURO)

    return img.resize((LADO, LADO), Image.LANCZOS)


if __name__ == "__main__":
    base = desenhar()

    ico = "apps/web/public/favicon.ico"
    base.save(ico, format="ICO", sizes=[(n, n) for n in TAMANHOS])
    print(f"{ico}: {', '.join(f'{n}x{n}' for n in TAMANHOS)}")

    # 180x180 é o tamanho que o iOS pede hoje. Sem alfa: o iOS achata a
    # transparência em PRETO, e o fundo grafite já preenche o quadrado.
    apple = "apps/web/public/apple-touch-icon.png"
    base.convert("RGB").resize((180, 180), Image.LANCZOS).save(apple, format="PNG")
    print(f"{apple}: 180x180")
