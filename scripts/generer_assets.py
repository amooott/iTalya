"""Génère l'icône et l'écran de démarrage d'iTalya (Inspecteur Xtream)."""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

RACINE = Path(__file__).resolve().parent.parent
ASSETS = RACINE / "assets"
ASSETS.mkdir(exist_ok=True)

POLICE_GRAS = Path(r"C:\Users\amoot\Desktop\projet-test-exe\xtream_inspector\fonts\Inter-Bold.ttf")
POLICE_NORMALE = Path(r"C:\Users\amoot\Desktop\projet-test-exe\xtream_inspector\fonts\Inter-Regular.ttf")

HAUT = (7, 17, 32)
BAS = (12, 27, 51)
CYAN = (34, 211, 238)
BLEU = (76, 141, 255)


def degrade(largeur: int, hauteur: int) -> Image.Image:
    x = np.linspace(0, 1, largeur)[None, :]
    y = np.linspace(0, 1, hauteur)[:, None]
    t = np.clip((x * 0.35 + y) / 1.35, 0, 1)[..., None]
    debut = np.array(HAUT, dtype=float)
    fin = np.array(BAS, dtype=float)
    pixels = debut + (fin - debut) * t
    return Image.fromarray(pixels.astype(np.uint8), "RGB")


def marque(image: Image.Image, centre, rayon: int) -> None:
    """Radar : anneaux concentriques, halo et triangle de lecture."""
    calque = Image.new("RGBA", image.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(calque)
    cx, cy = centre

    # Halo doux
    for i, alpha in [(1.55, 18), (1.25, 28)]:
        r = int(rayon * i)
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(*BLEU, alpha))

    # Anneaux
    for i, (factor, alpha) in enumerate([(1.0, 70), (0.72, 55), (0.44, 45)]):
        r = int(rayon * factor)
        d.ellipse(
            (cx - r, cy - r, cx + r, cy + r),
            outline=(*CYAN, alpha),
            width=max(2, int(rayon * 0.012)),
        )

    # Balayage
    d.pieslice(
        (cx - rayon, cy - rayon, cx + rayon, cy + rayon),
        start=-58,
        end=-10,
        fill=(*CYAN, 26),
    )

    # Triangle de lecture
    t = rayon * 0.34
    d.polygon(
        [(cx - t * 0.55, cy - t), (cx - t * 0.55, cy + t), (cx + t * 0.95, cy)],
        fill=(255, 255, 255, 255),
    )

    image.alpha_composite(calque)


def icone() -> None:
    taille = 4096
    image = degrade(taille, taille).convert("RGBA")
    marque(image, (taille / 2, taille / 2), int(taille * 0.30))
    image.resize((1024, 1024), Image.LANCZOS).convert("RGB").save(ASSETS / "icon.png", optimize=True)


def splash() -> None:
    largeur, hauteur = 1284, 2778
    image = degrade(largeur, hauteur).convert("RGBA")
    marque(image, (largeur / 2, hauteur * 0.38), 170)

    d = ImageDraw.Draw(image)
    titre = ImageFont.truetype(str(POLICE_GRAS), 150)
    sous_titre = ImageFont.truetype(str(POLICE_NORMALE), 40)

    def centrer(texte, police, y, couleur):
        boite = d.textbbox((0, 0), texte, font=police)
        d.text(((largeur - (boite[2] - boite[0])) / 2, y), texte, font=police, fill=couleur)

    centrer("iTalya", titre, int(hauteur * 0.50), (255, 255, 255, 255))
    centrer("I N S P E C T E U R   X T R E A M", sous_titre, int(hauteur * 0.585), (143, 161, 191, 255))
    image.convert("RGB").save(ASSETS / "splash.png", optimize=True)


if __name__ == "__main__":
    icone()
    splash()
    print("Assets générés dans", ASSETS)
