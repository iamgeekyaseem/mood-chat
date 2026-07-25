"""Beat 9 — "Every branch has a colour and a shape" (34.0-39.5s in the brag
timeline).

Same root-to-four-branches shape as graph_canvas.py, but slowed down and
relabelled as an explicit legend: each strand's colour name and dash pattern
spelled out, so the "never colour alone" rule (frontend/src/colors.ts) reads
as the point of the scene rather than incidental styling. Connectors are the
same anchored Line/DashedVMobject construction as graph_canvas.py — no new
geometry technique introduced here.

Smoke test:
    manim -ql --transparent color_law.py ColorLaw

Final render:
    manim -qh --transparent color_law.py ColorLaw
"""

from manim import DOWN, LEFT, RIGHT, UP, Create, DashedVMobject, FadeIn, Scene, VGroup, config

from branch_theme import AMBER, BLUE, GREEN, MAGENTA, NEUTRAL_STROKE, connector, make_card

config.background_color = "#171614"

LEGEND = [
    ("solid", BLUE, 3.0, 0.0, None),
    ("wide dash", AMBER, 1.0, 0.18, 10),
    ("fine dash", MAGENTA, -1.0, -0.18, 22),
    ("dash-dot", GREEN, -3.0, 0.0, 6),
]


class ColorLaw(Scene):
    def construct(self):
        root = make_card("a branch", NEUTRAL_STROKE, width=2.6, height=0.7, font_size=22)
        root.move_to([-4.8, 0, 0])

        cards = VGroup()
        strands = VGroup()
        for label, color, y, curve, num_dashes in LEGEND:
            card = make_card(label, color, width=2.6, height=0.6, font_size=20)
            card.move_to([2.2, y, 0])
            cards.add(card)
            strand = connector(root.rect, card.rect, color, start_edge=RIGHT, end_edge=LEFT, curve_angle=curve)
            if num_dashes:
                strand = DashedVMobject(strand, num_dashes=num_dashes, dashed_ratio=0.55)
            strands.add(strand)

        self.play(FadeIn(root), run_time=0.4)
        for strand, card in zip(strands, cards):
            self.play(Create(strand), FadeIn(card), run_time=0.55)
        self.wait(1.2)
