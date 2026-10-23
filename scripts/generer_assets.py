"""Génère l'icône et l'écran de démarrage d'iTalya (PNG)."""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

RACINE = Path(__file__).resolve().parent.parent
ASSETS = RACINE / "assets"
ASSETS.mkdir(exist_ok=True)

POLICE_GRAS = Path(r"C:\Users\amoot\Desktop\projet-test-exe\xtream_inspector\fonts\Inter-Bold.ttf")
POLICE_NORMALE = Path(r"C:\Users\amoot\Desktop\projet-test-exe\xtream_inspector\fonts\Inter-Regular.ttf")

INDIGO = (79, 70, 229)
VIOLET = (124, 58, 237)


def degrade(largeur: int, hauteur: int) -> Image.Image:
    """Dégradé diagonal indigo -> violet, en float puis conversion RGB."""
    x = np.linspace(0, 1, largeur)[None, :]
    y = np.linspace(0, 1, hauteur)[:, None]
    t = np.clip((x + y) / 2, 0, 1)[..., None]
    debut = np.array(INDIGO, dtype=float)
    fin = np.array(VIOLET, dtype=float)
    pixels = debut + (fin - debut) * t
    return Image.fromarray(pixels.astype(np.uint8), "RGB")


def dessiner_marque(image: Image.Image, centre, rayon: int, epaisseur: int) -> None:
    """Cercle translucide + coche blanche, dessinés en haute résolution."""
    calque = Image.new("RGBA", image.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(calque)
    cx, cy = centre
    d.ellipse(
        (cx - rayon, cy - rayon, cx + rayon, cy + rayon),
        fill=(255, 255, 255, 38),
        outline=(255, 255, 255, 70),
        width=max(2, epaisseur // 6),
    )
    d.line(
        [
            (cx - rayon * 0.42, cy + rayon * 0.02),
            (cx - rayon * 0.10, cy + rayon * 0.34),
            (cx + rayon * 0.46, cy - rayon * 0.30),
        ],
        fill=(255, 255, 255, 255),
        width=epaisseur,
        joint="curve",
    )
    # Extrémités arrondies.
    for point in [(cx - rayon * 0.42, cy + rayon * 0.02), (cx + rayon * 0.46, cy - rayon * 0.30)]:
        d.ellipse(
            (point[0] - epaisseur / 2, point[1] - epaisseur / 2,
             point[0] + epaisseur / 2, point[1] + epaisseur / 2),
            fill=(255, 255, 255, 255),
        )
    image.alpha_composite(calque)


def icone() -> None:
    taille = 4096  # suréchantillonnage pour des bords nets
    fond = degrade(taille, taille).convert("RGBA")
    dessiner_marque(fond, (taille / 2, taille / 2), int(taille * 0.30), int(taille * 0.072))
    fond = fond.resize((1024, 1024), Image.LANCZOS).convert("RGB")
    fond.save(ASSETS / "icon.png", optimize=True)


def splash() -> None:
    largeur, hauteur = 1284, 2778
    image = degrade(largeur, hauteur).convert("RGBA")
    dessiner_marque(image, (largeur / 2, hauteur * 0.40), 190, 42)

    d = ImageDraw.Draw(image)
    titre = ImageFont.truetype(str(POLICE_GRAS), 132)
    sous_titre = ImageFont.truetype(str(POLICE_NORMALE), 46)

    def centrer(texte: str, police: ImageFont.FreeTypeFont, y: int, couleur):
        boite = d.textbbox((0, 0), texte, font=police)
        largeur_texte = boite[2] - boite[0]
        d.text(((largeur - largeur_texte) / 2, y), texte, font=police, fill=couleur)

    centrer("iTalya", titre, int(hauteur * 0.50), (255, 255, 255, 255))
    centrer("Vos tâches, au clair.", sous_titre, int(hauteur * 0.575), (255, 255, 255, 190))
    image.convert("RGB").save(ASSETS / "splash.png", optimize=True)


if __name__ == "__main__":
    icone()
    splash()
    print("Assets générés dans", ASSETS)
