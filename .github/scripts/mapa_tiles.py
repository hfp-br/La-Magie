"""Gera o mosaico de tiles das imagens de mapa (usado pelo workflow mapa-tiles).

Para cada imagem em <pasta_img>/NOME.ext cria <pasta_tiles>/NOME/:
  tiles.json            {"versao", "tamanho", "formato", "niveis", "largura", "altura"}
  <z>/<x>_<y>.webp      tiles de 1024 px

Convenção do mapa.html (Leaflet CRS.Simple): a imagem ocupa [[0,0],[altura,largura]],
ou seja, no zoom 0 vai de y=-altura (topo) até y=0 (base). Os tiles seguem essa grade:
a imagem é encostada em y=0 e as bordas que sobram ficam transparentes.
Níveis: 0 (resolução máxima), -2, -4... (cada um 4x menor) até caber num tile.

Também apaga pastas de tiles cuja imagem não existe mais.
Uso: python3 mapa_tiles.py <pasta_img> <pasta_tiles>
"""
import json, math, os, shutil, sys
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
TAM, QUALIDADE = 1024, 85
EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def tile_de(nivel, c, r, linhas, w, h):
    """Recorta o tile (c, r) do nível já reduzido; preenche fora da imagem com transparência."""
    topo = linhas * TAM - h  # faixa vazia acima da imagem
    x0, y0 = c * TAM, r * TAM - topo
    caixa = (max(0, x0), max(0, y0), min(w, x0 + TAM), min(h, y0 + TAM))
    if caixa[0] >= caixa[2] or caixa[1] >= caixa[3]:
        return None
    pedaco = nivel.crop(caixa)
    if caixa == (x0, y0, x0 + TAM, y0 + TAM) and nivel.mode == "RGB":
        return pedaco
    tile = Image.new("RGBA", (TAM, TAM), (0, 0, 0, 0))
    tile.paste(pedaco, (caixa[0] - x0, caixa[1] - y0))
    return tile


def gerar(origem, saida):
    img = Image.open(origem)
    img = img.convert("RGBA" if img.mode in ("RGBA", "LA", "P") else "RGB")
    W, H = img.size
    tmp = saida + ".tmp"
    shutil.rmtree(tmp, ignore_errors=True)
    niveis, z, nivel = [], 0, img
    while True:
        w, h = nivel.size
        colunas, linhas = math.ceil(w / TAM), math.ceil(h / TAM)
        os.makedirs(os.path.join(tmp, str(z)), exist_ok=True)
        for c in range(colunas):
            for r in range(linhas):
                t = tile_de(nivel, c, r, linhas, w, h)
                if t is not None:
                    t.save(os.path.join(tmp, str(z), f"{c}_{r - linhas}.webp"), "WEBP", quality=QUALIDADE, method=4)
        niveis.append(z)
        if w <= TAM and h <= TAM:
            break
        z -= 2
        s = 2.0 ** z
        nivel = img.resize((max(1, round(W * s)), max(1, round(H * s))), Image.LANCZOS)
    with open(os.path.join(tmp, "tiles.json"), "w", encoding="utf-8") as f:
        json.dump({"versao": 1, "tamanho": TAM, "formato": "webp", "niveis": niveis, "largura": W, "altura": H}, f)
    shutil.rmtree(saida, ignore_errors=True)
    os.rename(tmp, saida)
    return niveis


def main(pasta_img, pasta_tiles):
    os.makedirs(pasta_tiles, exist_ok=True)
    nomes = {}
    for arq in sorted(os.listdir(pasta_img)) if os.path.isdir(pasta_img) else []:
        base, ext = os.path.splitext(arq)
        if ext.lower() in EXTS:
            nomes[base] = os.path.join(pasta_img, arq)
    mudou = False
    for base, caminho in nomes.items():
        destino = os.path.join(pasta_tiles, base)
        if os.path.isfile(os.path.join(destino, "tiles.json")):
            continue  # o nome do arquivo muda a cada envio, então tiles existentes estão certos
        print("gerando", base, flush=True)
        print("  níveis", gerar(caminho, destino), flush=True)
        mudou = True
    for pasta in sorted(os.listdir(pasta_tiles)):
        if pasta not in nomes and not pasta.endswith(".tmp"):
            print("apagando tiles órfãos", pasta, flush=True)
            shutil.rmtree(os.path.join(pasta_tiles, pasta))
            mudou = True
    print("mudou" if mudou else "nada a fazer")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
