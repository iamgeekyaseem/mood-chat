"""Beat 3 — "Every branch, one canvas" (7.2-11.7s in the brag timeline).

A root card fans into four colour-coded branch cards (blue/amber/magenta/
green), each connector using a distinct dash pattern so branches read apart
without relying on colour alone (frontend/src/colors.ts's rule). A minimap
thumbnail of the same shape locks into the corner, echoing GraphView.tsx's
minimap. Every connector is anchored to the real card mobjects
(branch_theme.connector) — never a hand-typed angle/length.

Smoke test:
    manim -ql --transparent graph_canvas.py GraphCanvas

Final render:
    manim -qh --transparent graph_canvas.py GraphCanvas
"""

from manim import (
    DOWN,
    LEFT,
    RIGHT,
    UP,
    Create,
    DashedVMobject,
    FadeIn,
    Rectangle,
    Scene,
    VGroup,
    config,
)

from branch_theme import AMBER, BLUE, GREEN, MAGENTA, NEUTRAL_STROKE, connector, make_card

config.background_color = "#171614"


def build_tree(scale: float = 1.0):
    """Root + 4 colour-coded branches, each connector its own dash pattern."""
    root = make_card("conversation root", NEUTRAL_STROKE, width=3.2, height=0.75, font_size=20)
    root.move_to([-4.6, 0, 0])

    specs = [
        ("blue", BLUE, 3.0, 0.0, None),
        ("amber", AMBER, 1.0, 0.18, 24),
        ("magenta", MAGENTA, -1.0, -0.18, 10),
        ("green", GREEN, -3.0, 0.0, 4),
    ]
    branches = VGroup()
    strands = VGroup()
    for label, color, y, curve, num_dashes in specs:
        card = make_card(label, color, width=2.2, height=0.55, font_size=20)
        card.move_to([1.8, y, 0])
        branches.add(card)
        strand = connector(root.rect, card.rect, color, start_edge=RIGHT, end_edge=LEFT, curve_angle=curve)
        if num_dashes:
            strand = DashedVMobject(strand, num_dashes=num_dashes, dashed_ratio=0.55)
        strands.add(strand)

    group = VGroup(root, strands, branches)
    group.scale(scale)
    return group, root, strands, branches


class GraphCanvas(Scene):
    def construct(self):
        tree, root, strands, branches = build_tree()

        minimap_border = Rectangle(width=2.2, height=1.5, color=NEUTRAL_STROKE, stroke_width=2)
        minimap_border.to_corner(UP + RIGHT, buff=0.35)
        mini_tree, _, _, _ = build_tree(scale=0.16)
        mini_tree.move_to(minimap_border.get_center())

        self.play(FadeIn(root), run_time=0.4)
        self.play(*[Create(s) for s in strands], run_time=0.9)
        self.play(*[FadeIn(b) for b in branches], run_time=0.6)
        self.play(Create(minimap_border), FadeIn(mini_tree), run_time=0.5)
        self.wait(1.6)
