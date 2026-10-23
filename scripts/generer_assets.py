"""Génère l'icône et l'écran de démarrage de Talya (logo ambre sur ardoise)."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

RACINE = Path(__file__).resolve().parent.parent
ASSETS = RACINE / "assets"
ASSETS.mkdir(exist_ok=True)

POLICE_GRAS = Path(r"C:\Users\amoot\Desktop\projet-test-exe\xtream_inspector\fonts\Inter-Bold.ttf")
POLICE_NORMALE = Path(r"C:\Users\amoot\Desktop\projet-test-exe\xtream_inspector\fonts\Inter-Regular.ttf")

ARDOISE = (15, 23, 42)
AMBRE = (245, 158, 11)
GRIS = (148, 163, 184)


def dessiner_logo(image: Image.Image, centre, largeur: int) -> None:
    """Écran ambre (contour) + pied, proportions du logo d'origine."""
    d = ImageDraw.Draw(image)
    cx, cy = centre

    # Écran : rectangle arrondi en contour (ratio 316 x 196 du logo).
    w = largeur
    h = int(w * 0.62)
    x0, y0 = cx - w / 2, cy - h / 2 - int(w * 0.03)
    x1, y1 = cx + w / 2, cy + h / 2 - int(w * 0.03)
    stroke = max(4, int(w * 0.095))
    rayon = int(w * 0.15)
    d.rounded_rectangle((x0, y0, x1, y1), radius=rayon, outline=AMBRE, width=stroke)

    # Pied : barre arrondie.
    pied_w = int(w * 0.42)
    pied_h = int(w * 0.09)
    py = y1 + int(w * 0.075)
    d.rounded_rectangle(
        (cx - pied_w / 2, py, cx + pied_w / 2, py + pied_h),
        radius=pied_h // 2,
        fill=AMBRE,
    )


def icone() -> None:
    taille = 4096
    image = Image.new("RGB", (taille, taille), ARDOISE)
    dessiner_logo(image, (taille // 2, taille // 2), int(taille * 0.62))
    image.resize((1024, 1024), Image.LANCZOS).save(ASSETS / "icon.png", optimize=True)


def splash() -> None:
    largeur, hauteur = 1284, 2778
    image = Image.new("RGB", (largeur, hauteur), ARDOISE)
    dessiner_logo(image, (largeur // 2, int(hauteur * 0.36)), 330)

    d = ImageDraw.Draw(image)
    titre = ImageFont.truetype(str(POLICE_GRAS), 150)
    sous_titre = ImageFont.truetype(str(POLICE_NORMALE), 38)

    def centrer(texte, police, y, couleur):
        boite = d.textbbox((0, 0), texte, font=police)
        d.text(((largeur - (boite[2] - boite[0])) / 2, y), texte, font=police, fill=couleur)

    centrer("iTalya", titre, int(hauteur * 0.48), (248, 250, 252))
    centrer("I N S P E C T E U R   X T R E A M", sous_titre, int(hauteur * 0.565), GRIS)
    image.save(ASSETS / "splash.png", optimize=True)


if __name__ == "__main__":
    icone()
    splash()
    print("Assets générés dans", ASSETS)
